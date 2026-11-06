using System.Text.Json;
using System.IO.Compression;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using W = DocumentFormat.OpenXml.Wordprocessing;

static class Program
{
    static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    const int MaxBytes = 16 * 1024 * 1024;

    static async Task<int> Main()
    {
        try
        {
            using var input = new MemoryStream();
            var buffer = new byte[8192];
            int read;
            while ((read = await Console.OpenStandardInput().ReadAsync(buffer)) > 0)
            {
                if (input.Length + read > MaxBytes * 2) throw new Exception("Document request exceeds 32 MiB.");
                input.Write(buffer, 0, read);
            }
            using var request = JsonDocument.Parse(input.ToArray());
            var r = request.RootElement;
            var action = r.GetProperty("action").GetString();
            object result = action == "fixture" ? Fixture(r.TryGetProperty("fixture", out var f) ? f.GetString() : null) : Process(r);
            Console.WriteLine(JsonSerializer.Serialize(new { ok = true, result }, Json));
            return 0;
        }
        catch (Exception error)
        {
            Console.WriteLine(JsonSerializer.Serialize(new { ok = false, error = error.Message }, Json));
            return 1;
        }
    }

    static object Process(JsonElement request)
    {
        var bytes = Convert.FromBase64String(request.GetProperty("base64").GetString()!);
        if (bytes.Length > MaxBytes) throw new Exception("DOCX exceeds 16 MiB.");
        using (var archive = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read))
            if (archive.Entries.Count > 2000 || archive.Entries.Sum(e => e.Length) > 64 * 1024 * 1024)
                throw new Exception("DOCX package exceeds 2000 parts or 64 MiB expanded size.");
        using var stream = new MemoryStream();
        stream.Write(bytes);
        stream.Position = 0;
        using var doc = WordprocessingDocument.Open(stream, true, new OpenSettings { MaxCharactersInPart = 4_000_000 });
        var main = doc.MainDocumentPart ?? throw new Exception("Missing Word main document part.");
        var document = main.Document ?? throw new Exception("Missing Word document.");
        var body = document.Body ?? throw new Exception("Missing Word body.");
        if (body.ChildElements.Count > 5000) throw new Exception("DOCX exceeds 5000 top-level blocks.");
        var mode = request.TryGetProperty("revisionMode", out var m) ? m.GetString() : null;
        var revisionElements = body.Descendants().Where(IsRevision).ToArray();
        bool revisions = revisionElements.Length != 0;
        if (revisionElements.Any(e => e is not W.InsertedRun && e is not W.DeletedRun))
            throw new Exception("This file has structural or formatting revisions. Resolve them in Word first; the original file is unchanged.");
        if (mode is "accept" or "reject")
        {
            Settle(body, mode == "accept");
        }

        if (request.GetProperty("action").GetString() == "export")
        {
            if (revisions && mode is not ("accept" or "reject")) throw new Exception("Choose how to resolve existing Word revisions before export.");
            foreach (var patch in request.GetProperty("paragraphs").EnumerateArray())
            {
                int index = patch.GetProperty("sourceIndex").GetInt32();
                if (index < 0 || index >= body.ChildElements.Count || body.ChildElements[index] is not W.Paragraph p || !Editable(p))
                    throw new Exception("The export targets an unsupported paragraph.");
                var original = p.Elements<W.Run>().Select(run => new SourceRun(run, run.InnerText)).ToArray();
                var originalText = string.Concat(original.Select(run => run.Text));
                if (originalText != patch.GetProperty("before").GetString()) throw new Exception("Export source no longer matches its paragraph.");
                var segments = patch.GetProperty("segments").EnumerateArray().ToArray();
                if (string.Concat(segments.Where(s => s.GetProperty("kind").GetString() != "insert").Select(s => s.GetProperty("text").GetString())) != originalText)
                    throw new Exception("Export diff does not cover the exact source.");
                bool tracked = request.GetProperty("tracked").GetBoolean();
                int offset = 0;
                var prepared = new List<(string Kind, W.Run[] Runs)>();
                foreach (var segment in segments)
                {
                    var kind = segment.GetProperty("kind").GetString()!;
                    var text = segment.GetProperty("text").GetString()!;
                    if (kind == "insert")
                    {
                        var insertion = new W.Run(new W.Text(text) { Space = SpaceProcessingModeValues.Preserve });
                        var styleSource = segment.GetProperty("styleFrom");
                        if (styleSource.ValueKind != JsonValueKind.Null)
                        {
                            int styleFrom = styleSource.GetInt32();
                            if (styleFrom < 0 || styleFrom > originalText.Length) throw new Exception("Insertion style source is outside the original paragraph.");
                            var style = StyleAt(original, styleFrom);
                            if (style != null) insertion.PrependChild(style);
                        }
                        prepared.Add((kind, [insertion]));
                    }
                    else
                    {
                        var runs = Slice(original, offset, text.Length, kind == "delete" && tracked);
                        if (kind is not ("equal" or "delete")) throw new Exception("Unknown diff segment.");
                        prepared.Add((kind, runs));
                        offset += text.Length;
                    }
                }
                if (EquivalentRuns(original, prepared.Where(e => e.Kind != "delete").SelectMany(e => e.Runs))) continue;
                foreach (var child in p.ChildElements.Where(e => e is not W.ParagraphProperties).ToArray()) child.Remove();
                int revisionId = 0;
                foreach (var edit in prepared)
                {
                    if (edit.Kind == "insert" && tracked) p.Append(new W.InsertedRun(edit.Runs) { Id = (index * 100000 + revisionId++).ToString(), Author = "" });
                    else if (edit.Kind == "delete" && tracked) p.Append(new W.DeletedRun(edit.Runs) { Id = (index * 100000 + revisionId++).ToString(), Author = "" });
                    else if (edit.Kind != "delete") { foreach (var run in edit.Runs) p.Append(run); }
                }
            }
            document.Save();
            ClearMetadata(doc);
            var errors = new OpenXmlValidator(FileFormatVersions.Microsoft365).Validate(doc).Take(10).Select(e => e.Description).ToArray();
            if (errors.Length != 0) throw new Exception("Open XML validation failed: " + string.Join("; ", errors));
            doc.Dispose();
            return new { base64 = NormalizeZip(stream.ToArray()), validation = "Open XML SDK schema validation passed" };
        }

        var blocks = body.ChildElements.Where(e => e is not W.SectionProperties).Select((e, i) => new
        {
            sourceIndex = body.ChildElements.ToList().IndexOf(e),
            text = e.InnerText,
            editable = e is W.Paragraph p && Editable(p),
            style = e is W.Paragraph paragraph ? paragraph.ParagraphProperties?.ParagraphStyleId?.Val?.Value : null,
            runs = e is W.Paragraph para && Editable(para)
                ? para.Elements<W.Run>().Select(run => new { text = run.InnerText, bold = run.RunProperties?.Bold is { Val: not { Value: false } }, italic = run.RunProperties?.Italic is { Val: not { Value: false } } }).ToArray()
                : [],
            reason = e is W.Paragraph simple && Editable(simple) ? null : "Preserved in original DOCX; read only in this release (complex content or anchors)."
        }).ToArray();
        var warnings = new List<string>();
        if (blocks.Any(b => !b.editable)) warnings.Add("Complex blocks remain in the original package and export unchanged. They cannot be edited in this release.");
        if (main.HeaderParts.Any() || main.FooterParts.Any()) warnings.Add("Headers and footers are preserved; not shown in the workbench.");
        if (main.WordprocessingCommentsPart != null) warnings.Add("Word comments are preserved; comment editing is not implemented in this slice.");
        if (revisions && mode == null) warnings.Add("Existing revisions require an explicit accept or reject choice before editing.");
        document.Save();
        doc.Dispose();
        return new { blocks, warnings, hasRevisions = revisions, normalizedBase64 = Convert.ToBase64String(stream.ToArray()) };
    }

    static bool IsRevision(OpenXmlElement e) => e is W.TrackChangeType or W.RunTrackChangeType
        || e.LocalName.EndsWith("Change", StringComparison.Ordinal) || e.LocalName.StartsWith("move", StringComparison.Ordinal);

    static bool Editable(W.Paragraph p) => p.ChildElements.All(e => e is W.ParagraphProperties || e is W.Run r && r.ChildElements.All(c => c is W.RunProperties or W.Text))
        && !p.Descendants().Any(IsRevision);

    record SourceRun(W.Run Run, string Text);

    static bool EquivalentRuns(SourceRun[] original, IEnumerable<W.Run> current)
    {
        // Run boundaries can split during revisions; compare text spans with the
        // complete SDK RunProperties, including color, fonts, language and size.
        var left = original.Where(r => r.Text.Length > 0).Select(r => (r.Text, Properties: r.Run.RunProperties?.OuterXml ?? "")).ToArray();
        var right = current.Select(r => (Text: r.InnerText, Properties: r.RunProperties?.OuterXml ?? "")).Where(r => r.Text.Length > 0).ToArray();
        int a = 0, b = 0, aOffset = 0, bOffset = 0;
        while (a < left.Length && b < right.Length)
        {
            int length = Math.Min(left[a].Text.Length - aOffset, right[b].Text.Length - bOffset);
            if (left[a].Properties != right[b].Properties || !left[a].Text.AsSpan(aOffset, length).SequenceEqual(right[b].Text.AsSpan(bOffset, length))) return false;
            aOffset += length; bOffset += length;
            if (aOffset == left[a].Text.Length) { a++; aOffset = 0; }
            if (bOffset == right[b].Text.Length) { b++; bOffset = 0; }
        }
        return a == left.Length && b == right.Length;
    }

    static W.RunProperties? StyleAt(SourceRun[] source, int position)
    {
        int start = 0;
        foreach (var run in source)
        {
            if (position < start + run.Text.Length) return run.Run.RunProperties?.CloneNode(true) as W.RunProperties;
            start += run.Text.Length;
        }
        return source.LastOrDefault()?.Run.RunProperties?.CloneNode(true) as W.RunProperties;
    }

    static W.Run[] Slice(SourceRun[] source, int start, int length, bool deleted)
    {
        var result = new List<W.Run>();
        int offset = 0;
        foreach (var run in source)
        {
            int from = Math.Max(0, start - offset), to = Math.Min(run.Text.Length, start + length - offset);
            if (to > from)
            {
                var part = new W.Run();
                if (run.Run.RunProperties != null) part.Append(run.Run.RunProperties.CloneNode(true));
                var text = run.Text[from..to];
                if (deleted) part.Append(new W.DeletedText(text) { Space = SpaceProcessingModeValues.Preserve });
                else part.Append(new W.Text(text) { Space = SpaceProcessingModeValues.Preserve });
                result.Add(part);
            }
            offset += run.Text.Length;
        }
        return result.ToArray();
    }

    static void Settle(W.Body body, bool accept)
    {
        foreach (var e in body.Descendants().Where(e => e is W.InsertedRun or W.DeletedRun).Reverse().ToArray())
        {
            bool keep = e is W.InsertedRun ? accept : !accept;
            if (keep)
            {
                foreach (var child in e.ChildElements.ToArray())
                {
                    child.Remove();
                    foreach (var deleted in child.Descendants<W.DeletedText>().ToArray()) deleted.Parent!.ReplaceChild(new W.Text(deleted.Text) { Space = deleted.Space }, deleted);
                    e.InsertBeforeSelf(child);
                }
            }
            e.Remove();
        }
    }

    static void ClearMetadata(WordprocessingDocument doc)
    {
        var p = doc.PackageProperties;
        p.Creator = null; p.LastModifiedBy = null; p.Title = null; p.Subject = null; p.Description = null; p.Keywords = null;
        p.Category = null; p.ContentStatus = null; p.Identifier = null; p.Revision = null; p.Version = null;
        p.Created = null; p.Modified = null; p.LastPrinted = null; p.Language = null; p.ContentType = null;
        if (doc.ExtendedFilePropertiesPart != null) doc.DeletePart(doc.ExtendedFilePropertiesPart);
        if (doc.CustomFilePropertiesPart != null) doc.DeletePart(doc.CustomFilePropertiesPart);
    }

    static string NormalizeZip(byte[] bytes)
    {
        using var output = new MemoryStream();
        using (var input = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read))
        using (var zip = new ZipArchive(output, ZipArchiveMode.Create, true))
            foreach (var entry in input.Entries)
            {
                var copy = zip.CreateEntry(entry.FullName, CompressionLevel.Optimal);
                copy.LastWriteTime = new DateTimeOffset(1980, 1, 1, 0, 0, 0, TimeSpan.Zero);
                using var src = entry.Open(); using var dest = copy.Open(); src.CopyTo(dest);
            }
        return Convert.ToBase64String(output.ToArray());
    }

    static object Fixture(string? variant)
    {
        using var stream = new MemoryStream();
        using (var doc = WordprocessingDocument.Create(stream, WordprocessingDocumentType.Document, true))
        {
            var main = doc.AddMainDocumentPart();
            main.Document = new W.Document(new W.Body(
                new W.Paragraph(new W.ParagraphProperties(new W.ParagraphStyleId { Val = "Title" }), new W.Run(new W.Text("Feedback and local revision"))),
                new W.Paragraph(new W.Run(new W.Text("The worker executes the operation. The model proposes a change. The worker executes the operation."))),
                new W.Paragraph(new W.Run(new W.RunProperties(new W.Bold()), new W.Text("The result remains unverified."))),
                new W.Paragraph(new W.Run(new W.Text("The ") { Space = SpaceProcessingModeValues.Preserve }), new W.Run(new W.RunProperties(new W.Bold()), new W.Text("model")), new W.Run(new W.Text(" proposes a change.") { Space = SpaceProcessingModeValues.Preserve })),
                new W.SectionProperties(new W.PageSize { Width = 11906, Height = 16838 }, new W.PageMargin { Top = 1440, Bottom = 1440, Left = 1440, Right = 1440 })));
            if (variant is "repeated-format" or "repeated-color")
            {
                var properties = new W.RunProperties();
                if (variant == "repeated-color") properties.Color = new W.Color { Val = "FF0000" };
                else properties.Bold = new W.Bold();
                main.Document.Body!.ReplaceChild(new W.Paragraph(
                    new W.Run(properties, new W.Text("X ") { Space = SpaceProcessingModeValues.Preserve }),
                    new W.Run(new W.Text("X"))), main.Document.Body.Elements<W.Paragraph>().First());
            }
            if (variant == "paragraph-mark")
                main.Document.Body!.Elements<W.Paragraph>().First().ParagraphProperties!.Append(
                    new W.ParagraphMarkRunProperties(new W.Inserted { Id = "12", Author = "" }));
            ClearMetadata(doc);
            main.Document.Save();
        }
        return new { base64 = NormalizeZip(stream.ToArray()) };
    }
}
