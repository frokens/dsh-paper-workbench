using System.Text.Json;
using System.IO.Compression;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using W = DocumentFormat.OpenXml.Wordprocessing;

static partial class Program
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
            object result = action switch
            {
                "fixture" => Fixture(r.TryGetProperty("fixture", out var f) ? f.GetString() : null),
                "create" => CreateDocument(r),
                _ => Process(r)
            };
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
        if (revisionElements.Any(e => !SupportedRevision(e)))
            throw new Exception("This file has unsupported structural or formatting revisions. Resolve them in Word first; the original file is unchanged.");
        if (mode is "accept" or "reject")
        {
            Settle(body, mode == "accept");
        }

        if (request.GetProperty("action").GetString() is "export" or "normalize")
        {
            if (revisions && mode is not ("accept" or "reject")) throw new Exception("Choose how to resolve existing Word revisions before export.");
            WordAnchor[] anchors = [];
            if (request.GetProperty("action").GetString() == "export")
            {
                anchors = ProjectWord(body, request.GetProperty("flow"), request.GetProperty("tracked").GetBoolean());
                if (request.TryGetProperty("comments", out var comments) && comments.GetArrayLength() != 0) AttachComments(main, comments);
                if (request.TryGetProperty("bilingual", out var bilingual))
                {
                    if (request.GetProperty("tracked").GetBoolean()) throw new Exception("A bilingual working copy uses the clean primary body.");
                    AppendBilingual(body, bilingual);
                }
                StampDelivery(main, request);
            }
            if (request.TryGetProperty("generatedFonts", out var fonts) && fonts.GetBoolean()) GeneratedFonts(main);
            document.Save();
            ClearMetadata(doc);
            var errors = new OpenXmlValidator(FileFormatVersions.Microsoft365).Validate(doc).Take(10).Select(e => e.Description).ToArray();
            if (errors.Length != 0) throw new Exception("Open XML validation failed: " + string.Join("; ", errors));
            doc.Dispose();
            int outputLimit = request.TryGetProperty("maxOutputBytes", out var requestedLimit) ? requestedLimit.GetInt32() : MaxBytes;
            if (outputLimit < 1 || outputLimit > MaxBytes) throw new Exception("Invalid Word output capacity.");
            return new { base64 = NormalizeZip(stream.ToArray(), outputLimit), anchors, validation = "Open XML SDK schema validation passed" };
        }

        var nativeComments = ExtractComments(main, body);
        var blocks = body.ChildElements.Where(e => e is not W.SectionProperties).Select((e, i) => new
        {
            sourceIndex = body.ChildElements.ToList().IndexOf(e),
            nativeId = (e as W.Paragraph)?.ParagraphId?.Value,
            text = e.InnerText,
            editable = e is W.Paragraph p && Editable(p),
            paragraphFormat = (e as W.Paragraph)?.ParagraphProperties?.OuterXml ?? "",
            style = e is W.Paragraph paragraph ? paragraph.ParagraphProperties?.ParagraphStyleId?.Val?.Value : null,
            runs = e is W.Paragraph para && Editable(para)
                ? para.Elements<W.Run>().Select(run => new { text = run.InnerText, bold = run.RunProperties?.Bold is { Val: not { Value: false } }, italic = run.RunProperties?.Italic is { Val: not { Value: false } }, nativeFormat = run.RunProperties?.OuterXml ?? "" }).ToArray()
                : [],
            reason = e is W.Paragraph simple && Editable(simple) ? null : "Preserved in original DOCX; read only in this release (complex content or anchors)."
        }).ToArray();
        var warnings = new List<string>();
        if (blocks.Any(b => !b.editable)) warnings.Add("Complex blocks remain in the original package and export unchanged. They cannot be edited in this release.");
        if (main.HeaderParts.Any() || main.FooterParts.Any()) warnings.Add("Headers and footers are preserved; not shown in the workbench.");
        if (nativeComments.Any(c => c.Editable)) warnings.Add("Supported Word comment anchors were extracted from a derived source for source feedback; original comment bodies and the original upload remain preserved.");
        if (nativeComments.Any(c => !c.Editable)) warnings.Add("Some Word comments have unsupported, missing or ambiguous anchors. Those anchored objects remain read only in the source; inspect the original upload.");
        if (revisions && mode == null) warnings.Add("Existing revisions require an explicit accept or reject choice before editing.");
        document.Save();
        var deliveryMarkers = main.CustomXmlParts.Select(ReadDeliveryMarker).Where(marker => marker != null).ToArray();
        doc.Dispose();
        return new { blocks, nativeComments, deliveryMarkers, warnings, hasRevisions = revisions, normalizedBase64 = Convert.ToBase64String(stream.ToArray()) };
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


    static void ClearMetadata(WordprocessingDocument doc)
    {
        var p = doc.PackageProperties;
        p.Creator = null; p.LastModifiedBy = null; p.Title = null; p.Subject = null; p.Description = null; p.Keywords = null;
        p.Category = null; p.ContentStatus = null; p.Identifier = null; p.Revision = null; p.Version = null;
        p.Created = null; p.Modified = null; p.LastPrinted = null; p.Language = null; p.ContentType = null;
        if (doc.ExtendedFilePropertiesPart != null) doc.DeletePart(doc.ExtendedFilePropertiesPart);
        if (doc.CustomFilePropertiesPart != null) doc.DeletePart(doc.CustomFilePropertiesPart);
    }

    static string NormalizeZip(byte[] bytes, int limit = MaxBytes)
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
        if (output.Length > limit) throw new Exception("The Word output exceeds the allowed source capacity.");
        return Convert.ToBase64String(output.ToArray());
    }

    static object CreateDocument(JsonElement request)
    {
        var paragraphs = request.TryGetProperty("paragraphs", out var supplied)
            ? supplied.EnumerateArray().Select(p => p.GetString() ?? throw new Exception("A paragraph must be text.")).ToArray()
            : [""];
        if (paragraphs.Length is < 1 or > 5000 || paragraphs.Sum(p => (long)p.Length) > 4_000_000
            || paragraphs.Any(p => p.Contains('\r') || p.Contains('\n')))
            throw new Exception("Create requires 1–5000 paragraphs, at most four million characters, without embedded paragraph breaks.");
        using var stream = new MemoryStream();
        using (var doc = WordprocessingDocument.Create(stream, WordprocessingDocumentType.Document, true))
        {
            var main = doc.AddMainDocumentPart();
            var body = new W.Body();
            foreach (var text in paragraphs)
                body.Append(new W.Paragraph(new W.Run(new W.Text(text) { Space = SpaceProcessingModeValues.Preserve })));
            body.Append(new W.SectionProperties(new W.PageSize { Width = 11906, Height = 16838 },
                new W.PageMargin { Top = 1440, Bottom = 1440, Left = 1440, Right = 1440 }));
            main.Document = new W.Document(body);
            GeneratedFonts(main);
            main.Document.Save();
            ClearMetadata(doc);
            var errors = new OpenXmlValidator(FileFormatVersions.Microsoft365).Validate(doc).Take(10).Select(e => e.Description).ToArray();
            if (errors.Length != 0) throw new Exception("Open XML validation failed: " + string.Join("; ", errors));
        }
        return new { base64 = NormalizeZip(stream.ToArray()) };
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
            if (variant == "custom-format")
            {
                var paragraph = main.Document.Body!.Elements<W.Paragraph>().First();
                paragraph.ParagraphProperties = new W.ParagraphProperties(new W.ParagraphStyleId { Val = "CustomBody" },
                    new W.KeepNext(), new W.SpacingBetweenLines { After = "160", Line = "300" }, new W.Indentation { FirstLine = "240" });
                paragraph.Elements<W.Run>().First().RunProperties = new W.RunProperties(
                    new W.RunFonts { Ascii = "Cambria", HighAnsi = "Cambria", EastAsia = "Songti SC" },
                    new W.Color { Val = "153E75" }, new W.FontSize { Val = "23" }, new W.Languages { Val = "en-US", EastAsia = "zh-CN" });
            }
            if (variant is "comments" or "duplicate-comment-anchors")
            {
                var part = main.AddNewPart<WordprocessingCommentsPart>();
                part.Comments = new W.Comments(new W.Comment(new W.Paragraph(new W.Run(new W.Text("Preserve the confirmed meaning.")))) { Id = "8", Author = "" });
                var paragraph = main.Document.Body!.Elements<W.Paragraph>().First();
                paragraph.InsertAfter(new W.CommentRangeStart { Id = "8" }, paragraph.ParagraphProperties!);
                if (variant == "duplicate-comment-anchors") paragraph.Append(new W.CommentRangeStart { Id = "8" });
                paragraph.Append(new W.CommentRangeEnd { Id = "8" }, new W.Run(new W.CommentReference { Id = "8" }));
                part.Comments.Save();
            }
            ClearMetadata(doc);
            main.Document.Save();
        }
        return new { base64 = NormalizeZip(stream.ToArray()) };
    }
}
