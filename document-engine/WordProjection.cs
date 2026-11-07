using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using W = DocumentFormat.OpenXml.Wordprocessing;

static partial class Program
{
    static bool SupportedRevision(OpenXmlElement e) => e is W.InsertedRun or W.DeletedRun
        || e is W.Inserted or W.Deleted && e.Parent is W.ParagraphMarkRunProperties
        || e is W.ParagraphPropertiesChange && e.Parent is W.ParagraphProperties;

    record WorkingParagraph(string BlockId);
    record ProjectedParagraph;
    record WordAnchor(string BlockId, string NativeId);

    static WordAnchor[] ProjectWord(W.Body body, JsonElement supplied, bool tracked)
    {
        var source = body.ChildElements.Select(e => e.CloneNode(true)).ToArray();
        var output = new List<OpenXmlElement>();
        var events = new List<JsonElement>();
        var usedIds = source.Where(e => e is not W.Paragraph p || !Editable(p)).SelectMany(e => e.Descendants<W.Paragraph>().Prepend(e).OfType<W.Paragraph>())
            .Select(p => p.ParagraphId?.Value).Where(id => id != null).ToHashSet();
        int revisionId = 0, generatedId = 0;
        string NextRevision() => (revisionId++).ToString();
        string NativeId(string identity)
        {
            var digest = SHA256.HashData(Encoding.UTF8.GetBytes(identity));
            digest[0] &= 0x7f; // ST_LongHexNumber requires 0 < paraId < 0x80000000.
            return Convert.ToHexString(digest.AsSpan(0, 4));
        }
        W.Paragraph SourceParagraph(int index)
        {
            if (index < 0 || index >= source.Length || source[index] is not W.Paragraph p || !Editable(p))
                throw new Exception("The Word projection references an unsupported source paragraph.");
            return p;
        }
        W.ParagraphProperties Properties(JsonElement reference)
        {
            var result = reference.GetProperty("sourceIndex").ValueKind == JsonValueKind.Null
                ? new W.ParagraphProperties()
                : SourceParagraph(reference.GetProperty("sourceIndex").GetInt32()).ParagraphProperties?.CloneNode(true) as W.ParagraphProperties
                    ?? new W.ParagraphProperties();
            var heading = reference.GetProperty("heading").GetString();
            if (heading != null) result.ParagraphStyleId = new W.ParagraphStyleId { Val = heading };
            else if (result.ParagraphStyleId?.Val?.Value is string style
                && (style.Equals("Title", StringComparison.OrdinalIgnoreCase)
                    || style.Length == 8 && style.StartsWith("Heading", StringComparison.OrdinalIgnoreCase) && style[^1] is >= '1' and <= '6'))
                result.ParagraphStyleId = null;
            return result;
        }
        W.Run Run(JsonElement item, bool deleted)
        {
            string text = item.GetProperty("text").GetString()!;
            var run = new W.Run();
            var style = item.GetProperty("styleFrom");
            if (style.ValueKind != JsonValueKind.Null)
            {
                var p = SourceParagraph(style.GetProperty("sourceIndex").GetInt32());
                int offset = style.GetProperty("offset").GetInt32();
                var runs = p.Elements<W.Run>().Select(r => new SourceRun(r, r.InnerText)).ToArray();
                if (offset < 0 || offset > runs.Sum(r => r.Text.Length)) throw new Exception("A native style reference is out of range.");
                var properties = StyleAt(runs, offset);
                if (properties != null) run.Append(properties);
            }
            if (deleted) run.Append(new W.DeletedText(text) { Space = SpaceProcessingModeValues.Preserve });
            else run.Append(new W.Text(text) { Space = SpaceProcessingModeValues.Preserve });
            return run;
        }
        List<W.Paragraph> Build(string mode)
        {
            var result = new List<W.Paragraph>();
            var localIds = new HashSet<string?>(usedIds);
            var paragraph = new W.Paragraph();
            foreach (var item in events)
            {
                string kind = item.GetProperty("kind").GetString()!, change = item.GetProperty("change").GetString()!;
                if (change is not ("equal" or "insert" or "delete")) throw new Exception("Unknown Word change.");
                bool include = mode == "tracked" || change == "equal" || change == (mode == "before" ? "delete" : "insert");
                if (kind == "text")
                {
                    if (!include) continue;
                    var run = Run(item, mode == "tracked" && change == "delete");
                    if (mode == "tracked" && change == "delete") paragraph.Append(new W.DeletedRun(run) { Id = NextRevision(), Author = "" });
                    else if (mode == "tracked" && change == "insert") paragraph.Append(new W.InsertedRun(run) { Id = NextRevision(), Author = "" });
                    else paragraph.Append(run);
                    continue;
                }
                if (kind != "paragraph") throw new Exception("Unknown Word flow event.");
                if (!include) continue;
                var before = item.GetProperty("before");
                var after = item.GetProperty("after");
                var reference = mode == "before" || change == "delete" ? before : after;
                if (reference.ValueKind == JsonValueKind.Null) throw new Exception("A Word paragraph has no property source.");
                var properties = Properties(reference);
                if (mode == "tracked" && change == "equal")
                {
                    var previous = Properties(before);
                    if (properties.OuterXml != previous.OuterXml)
                    {
                        if (properties.SectionProperties != null || previous.SectionProperties != null)
                            throw new Exception("A structural edit crosses section properties. Resolve this boundary in Word; the source remains preserved.");
                        var prior = new W.ParagraphPropertiesExtended(previous.ChildElements.Select(e => e.CloneNode(true)));
                        prior.SetAttributes(previous.GetAttributes());
                        properties.ParagraphPropertiesChange = new W.ParagraphPropertiesChange(prior) { Id = NextRevision(), Author = "" };
                    }
                }
                if (mode == "tracked" && change != "equal")
                {
                    if (properties.SectionProperties != null)
                        throw new Exception("A structural edit changes a section-ending paragraph mark. Resolve this boundary in Word; the source remains preserved.");
                    var mark = properties.ParagraphMarkRunProperties ??= new W.ParagraphMarkRunProperties();
                    if (change == "insert") mark.Inserted = new W.Inserted { Id = NextRevision(), Author = "" };
                    else mark.Deleted = new W.Deleted { Id = NextRevision(), Author = "" };
                }
                paragraph.ParagraphProperties = properties.HasChildren || properties.HasAttributes ? properties : null;
                // These identifiers bind the delivered body to its receipt; they
                // are evidence to check on return, never an unconditional anchor.
                string identity = reference.GetProperty("blockId").GetString()!;
                if (mode == "tracked" && change == "delete") identity += ":deleted:" + generatedId++;
                if (reference.GetProperty("sourceIndex").ValueKind != JsonValueKind.Null)
                    paragraph.SetAttributes(SourceParagraph(reference.GetProperty("sourceIndex").GetInt32()).GetAttributes());
                string id = NativeId(identity);
                if (id == "00000000" || !localIds.Add(id))
                {
                    do { id = NativeId(identity + ":" + generatedId++); }
                    while (id == "00000000" || !localIds.Add(id));
                }
                paragraph.ParagraphId = id;
                paragraph.AddAnnotation(new ProjectedParagraph());
                if (mode != "before" && change != "delete") paragraph.AddAnnotation(new WorkingParagraph(reference.GetProperty("blockId").GetString()!));
                result.Add(paragraph); paragraph = new W.Paragraph();
            }
            if (paragraph.HasChildren) throw new Exception("The Word projection omits its final paragraph mark.");
            return result;
        }
        void Flush()
        {
            if (events.Count == 0) return;
            var before = Build("before");
            var after = Build("after");
            var native = tracked ? Build("tracked") : after;
            if (tracked)
            {
                // Replacement steps may cancel out at the native format level.
                // Compare full run/paragraph properties, not visible emphasis.
                if (before.Count == after.Count && before.Count == native.Count)
                    for (int index = 0; index < native.Count; index++)
                        if (EquivalentParagraph(before[index], after[index])) native[index] = after[index];
            }
            output.AddRange(native);
            foreach (var paragraph in native) usedIds.Add(paragraph.ParagraphId?.Value);
            events.Clear();
        }
        int lastOpaque = -1;
        foreach (var item in supplied.EnumerateArray())
        {
            if (item.GetProperty("kind").GetString() != "opaque") { events.Add(item); continue; }
            Flush();
            int index = item.GetProperty("sourceIndex").GetInt32();
            if (index <= lastOpaque || index >= source.Length || index < 0 || source[index] is W.SectionProperties
                || source[index] is W.Paragraph p && Editable(p)) throw new Exception("Invalid preserved Word object.");
            lastOpaque = index; output.Add(source[index].CloneNode(true));
        }
        Flush();
        var expectedOpaque = source.Select((e, i) => (e, i)).Where(x => x.e is not W.SectionProperties && (x.e is not W.Paragraph p || !Editable(p))).Select(x => x.i);
        if (!expectedOpaque.SequenceEqual(supplied.EnumerateArray().Where(e => e.GetProperty("kind").GetString() == "opaque").Select(e => e.GetProperty("sourceIndex").GetInt32())))
            throw new Exception("The Word projection must preserve every unsupported source object in order.");
        output.AddRange(source.OfType<W.SectionProperties>().Select(e => e.CloneNode(true)));
        body.RemoveAllChildren(); body.Append(output);
        return output.OfType<W.Paragraph>().Where(p => p.Annotation<WorkingParagraph>() != null)
            .Select(p => new WordAnchor(p.Annotation<WorkingParagraph>()!.BlockId, p.ParagraphId!.Value!)).ToArray();
    }


    static bool EquivalentParagraph(W.Paragraph before, W.Paragraph after) =>
        (before.ParagraphProperties?.OuterXml ?? "") == (after.ParagraphProperties?.OuterXml ?? "")
        && EquivalentRuns(before.Elements<W.Run>().Select(r => new SourceRun(r, r.InnerText)).ToArray(), after.Elements<W.Run>());

    static void AppendBilingual(W.Body body, JsonElement supplied, string? translationLanguage)
    {
        string language = translationLanguage switch { "en" => "en-US", "zh" => "zh-CN",
            _ => throw new Exception("Choose the supported translation language for the bilingual output.") };
        var paragraphs = body.Elements<W.Paragraph>().Where(p => p.Annotation<WorkingParagraph>() != null)
            .ToDictionary(p => p.Annotation<WorkingParagraph>()!.BlockId);
        var covered = new HashSet<string>();
        foreach (var group in supplied.EnumerateArray())
        {
            var ids = group.GetProperty("blockIds").EnumerateArray().Select(item => item.GetString()!).ToArray();
            if (ids.Length == 0 || ids.Any(id => !paragraphs.ContainsKey(id) || !covered.Add(id)))
                throw new Exception("The bilingual output has missing or overlapping source paragraphs.");
            var paragraph = new W.Paragraph();
            var properties = new W.RunProperties(new W.RunFonts { Ascii = "Cambria", HighAnsi = "Cambria", EastAsia = "Songti SC" },
                new W.Languages { Val = language, EastAsia = language });
            var lines = group.GetProperty("text").GetString()!.Split('\n');
            for (int index = 0; index < lines.Length; index++)
            {
                var run = new W.Run(properties.CloneNode(true));
                if (index > 0) run.Append(new W.Break());
                run.Append(new W.Text(lines[index]) { Space = SpaceProcessingModeValues.Preserve }); paragraph.Append(run);
            }
            paragraphs[ids[^1]].InsertAfterSelf(paragraph);
        }
        if (covered.Count != paragraphs.Count) throw new Exception("The bilingual output requires a current translation of every editable source paragraph.");
    }

    static void Settle(W.Body body, bool accept)
    {
        var joins = body.Descendants<W.Paragraph>().Where(p =>
            accept ? p.ParagraphProperties?.ParagraphMarkRunProperties?.Deleted != null
                : p.ParagraphProperties?.ParagraphMarkRunProperties?.Inserted != null).ToArray();
        foreach (var e in body.Descendants().Where(e => e is W.InsertedRun or W.DeletedRun).Reverse().ToArray())
        {
            bool keep = e is W.InsertedRun ? accept : !accept;
            if (keep)
                foreach (var child in e.ChildElements.ToArray())
                {
                    child.Remove();
                    foreach (var deleted in child.Descendants<W.DeletedText>().ToArray())
                        deleted.Parent!.ReplaceChild(new W.Text(deleted.Text) { Space = deleted.Space }, deleted);
                    e.InsertBeforeSelf(child);
                }
            e.Remove();
        }
        foreach (var change in body.Descendants<W.ParagraphPropertiesChange>().ToArray())
        {
            var properties = (W.ParagraphProperties)change.Parent!;
            if (!accept)
            {
                var previous = change.ParagraphPropertiesExtended ?? throw new Exception("A paragraph property revision has no previous properties.");
                var restored = new W.ParagraphProperties(previous.ChildElements.Select(e => e.CloneNode(true)));
                restored.SetAttributes(previous.GetAttributes()); properties.Parent!.ReplaceChild(restored, properties);
            }
            else change.Remove();
        }
        foreach (var mark in body.Descendants<W.ParagraphMarkRunProperties>().ToArray())
        {
            mark.Inserted?.Remove(); mark.Deleted?.Remove();
            if (!mark.HasChildren && !mark.HasAttributes) mark.Remove();
        }
        foreach (var properties in body.Descendants<W.ParagraphProperties>().Where(p => !p.HasChildren && !p.HasAttributes).ToArray()) properties.Remove();
        foreach (var paragraph in joins)
        {
            if (paragraph.NextSibling() is not W.Paragraph next) throw new Exception("A paragraph-mark revision crosses an unsupported block or final boundary.");
            var content = paragraph.ChildElements.Where(e => e is not W.ParagraphProperties).ToArray();
            var anchor = next.ChildElements.FirstOrDefault(e => e is not W.ParagraphProperties);
            foreach (var child in content) { child.Remove(); if (anchor == null) next.Append(child); else next.InsertBefore(child, anchor); }
            paragraph.Remove();
        }
    }
}
