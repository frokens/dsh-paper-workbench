using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using System.Text.Json;
using W = DocumentFormat.OpenXml.Wordprocessing;

static partial class Program
{
    record CommentRange(int SourceIndex, int From, int To);
    record ImportedComment(string Id, string Text, CommentRange[] Ranges, bool Editable);
    record CommentMarker(int Index, int Offset, string Kind);
    record CommentGroup(W.Paragraph[] Paragraphs);
    record CommentPosition(W.Run? Run, int Offset, W.Paragraph Paragraph);

    static IEnumerable<W.Run> AcceptedCommentRuns(CommentGroup group) => group.Paragraphs.SelectMany(p => p.Descendants<W.Run>())
        .Where(run => !run.Ancestors<W.DeletedRun>().Any() && run.Elements<W.Text>().Any());

    static CommentPosition? FindCommentPosition(CommentGroup group, int offset, bool end)
    {
        int position = 0;
        W.Run? last = null;
        foreach (var run in AcceptedCommentRuns(group))
        {
            int length = string.Concat(run.Elements<W.Text>().Select(text => text.Text)).Length;
            if (offset >= position && (offset < position + length || end && offset == position + length))
                return new CommentPosition(run, offset - position, run.Ancestors<W.Paragraph>().First());
            position += length; last = run;
        }
        return offset != position ? null : new CommentPosition(last, last == null ? 0 : last.InnerText.Length, group.Paragraphs[^1]);
    }

    static void PlaceCommentMarker(CommentPosition position, OpenXmlElement marker, Func<string> nextRevision)
    {
        var run = position.Run;
        if (run == null) { position.Paragraph.Append(marker); return; }
        var text = string.Concat(run.Elements<W.Text>().Select(item => item.Text));
        W.Run Fragment(string value)
        {
            var part = new W.Run(); part.SetAttributes(run.GetAttributes());
            if (run.RunProperties != null) part.Append(run.RunProperties.CloneNode(true));
            part.Append(new W.Text(value) { Space = SpaceProcessingModeValues.Preserve }); return part;
        }
        if (run.Parent is W.InsertedRun insertion)
        {
            // Markers remain outside the tracked insertion, including when its
            // text is later rejected. Each split revision keeps a unique ID.
            if (position.Offset == 0) { insertion.InsertBeforeSelf(marker); return; }
            if (position.Offset == text.Length) { insertion.InsertAfterSelf(marker); return; }
            if (insertion.ChildElements.Count != 1) throw new Exception("A comment requires an unsupported insertion boundary.");
            var left = (W.InsertedRun)insertion.CloneNode(false);
            var right = (W.InsertedRun)insertion.CloneNode(false); right.Id = nextRevision();
            left.Append(Fragment(text[..position.Offset])); right.Append(Fragment(text[position.Offset..]));
            insertion.InsertBeforeSelf(left); insertion.InsertBeforeSelf(marker); insertion.InsertBeforeSelf(right); insertion.Remove();
        }
        else if (run.Parent is W.Paragraph)
        {
            if (position.Offset == 0) run.InsertBeforeSelf(marker);
            else if (position.Offset == text.Length) run.InsertAfterSelf(marker);
            else
            {
                run.InsertBeforeSelf(Fragment(text[..position.Offset])); run.InsertBeforeSelf(marker);
                run.InsertBeforeSelf(Fragment(text[position.Offset..])); run.Remove();
            }
        }
        else throw new Exception("A comment requires an unsupported run boundary.");
    }

    static void AttachComments(MainDocumentPart main, JsonElement supplied)
    {
        var part = main.WordprocessingCommentsPart ?? main.AddNewPart<WordprocessingCommentsPart>();
        var comments = part!.Comments ??= new W.Comments();
        int lastId = comments.Elements<W.Comment>().Select(c => int.Parse(c.Id?.Value ?? throw new Exception("A Word comment body has no identifier."))).DefaultIfEmpty(-1).Max();
        var body = main.Document?.Body ?? throw new Exception("Missing Word body for comment anchors.");
        int revisionId = body.Descendants().Where(IsRevision).Select(e => e.GetAttribute("id", "http://schemas.openxmlformats.org/wordprocessingml/2006/main").Value)
            .Select(value => int.TryParse(value, out var id) ? id : -1).DefaultIfEmpty(-1).Max();
        string NextRevision() => checked(++revisionId).ToString();
        var groups = new Dictionary<string, CommentGroup>();
        var pending = new List<W.Paragraph>();
        foreach (var element in body.ChildElements)
        {
            if (element is not W.Paragraph paragraph || paragraph.Annotation<ProjectedParagraph>() == null) { pending.Clear(); continue; }
            pending.Add(paragraph);
            var working = paragraph.Annotation<WorkingParagraph>();
            if (working == null) continue;
            groups.Add(working.BlockId, new CommentGroup(pending.ToArray())); pending.Clear();
        }
        foreach (var item in supplied.EnumerateArray())
        {
            var ids = item.GetProperty("blockIds").EnumerateArray().Select(value => value.GetString()!).ToArray();
            if (ids.Length == 0 || ids.Any(id => !groups.ContainsKey(id))) throw new Exception("A Word comment has no exact delivered paragraph.");
            string id;
            if (item.TryGetProperty("nativeId", out var native))
            {
                id = native.GetString()!;
                if (comments.Elements<W.Comment>().Count(c => c.Id?.Value == id) != 1) throw new Exception("An original Word comment body is missing or ambiguous.");
            }
            else
            {
                id = checked(++lastId).ToString();
                var comment = new W.Comment { Id = id, Author = "" };
                foreach (var line in item.GetProperty("text").GetString()!.Split('\n'))
                    comment.Append(new W.Paragraph(new W.Run(new W.Text(line) { Space = SpaceProcessingModeValues.Preserve })));
                comments.Append(comment);
            }
            var start = new W.CommentRangeStart { Id = id };
            var end = new W.CommentRangeEnd { Id = id };
            if (item.TryGetProperty("selections", out var suppliedRanges))
            {
                var ranges = suppliedRanges.EnumerateArray().ToArray();
                if (!ranges.Select(range => range.GetProperty("blockId").GetString()!).SequenceEqual(ids))
                    throw new Exception("The comment source ranges do not match its delivered paragraphs.");
                foreach (var range in ranges)
                {
                    var group = groups[range.GetProperty("blockId").GetString()!];
                    int from = range.GetProperty("from").GetInt32(), to = range.GetProperty("to").GetInt32();
                    if (from < 0 || to < from || FindCommentPosition(group, from, false) == null || FindCommentPosition(group, to, true) == null)
                        throw new Exception("A comment source range is outside the exact delivered text.");
                }
                var first = ranges[0]; var last = ranges[^1];
                var fromGroup = groups[ids[0]]; var toGroup = groups[ids[^1]];
                int fromOffset = first.GetProperty("from").GetInt32(), toOffset = last.GetProperty("to").GetInt32();
                PlaceCommentMarker(FindCommentPosition(fromGroup, fromOffset, false)!, start, NextRevision);
                if (ids.Length == 1 && fromOffset == toOffset) start.InsertAfterSelf(end);
                else PlaceCommentMarker(FindCommentPosition(toGroup, toOffset, true)!, end, NextRevision);
            }
            else
            {
                var first = groups[ids[0]].Paragraphs[0];
                var anchor = first.ChildElements.FirstOrDefault(e => e is not W.ParagraphProperties);
                if (anchor == null) first.Append(start); else first.InsertBefore(start, anchor);
                groups[ids[^1]].Paragraphs[^1].Append(end);
            }
            end.InsertAfterSelf(new W.Run(new W.CommentReference { Id = id }));
        }
        comments.Save();
    }

    static bool CommentParagraph(W.Paragraph p) => p.ChildElements.All(e => e is W.ParagraphProperties
        or W.CommentRangeStart or W.CommentRangeEnd || e is W.Run r && r.ChildElements.All(c => c is W.RunProperties or W.Text or W.CommentReference))
        && !p.Descendants().Any(IsRevision);

    // Normalize only a derived source. The original upload and original comment
    // bodies stay intact; the Host binds extracted ranges to ordinary feedback.
    static ImportedComment[] ExtractComments(MainDocumentPart main, W.Body body)
    {
        var comments = main.WordprocessingCommentsPart?.Comments?.Elements<W.Comment>().ToArray() ?? [];
        var markers = new Dictionary<string, List<CommentMarker>>();
        var source = body.ChildElements.ToArray();
        for (int index = 0; index < source.Length; index++)
            foreach (var paragraph in source[index].Descendants<W.Paragraph>().Prepend(source[index]).OfType<W.Paragraph>())
            {
                int offset = 0;
                foreach (var child in paragraph.ChildElements)
                {
                    foreach (var marker in child.Descendants().Prepend(child).Where(e => e is W.CommentRangeStart or W.CommentRangeEnd or W.CommentReference))
                    {
                        string id = marker.GetAttribute("id", "http://schemas.openxmlformats.org/wordprocessingml/2006/main").Value ?? "";
                        if (!markers.TryGetValue(id, out var points)) markers[id] = points = [];
                        int position = offset;
                        if (child is W.Run run && marker is W.CommentReference)
                            position += run.ChildElements.TakeWhile(e => e != marker).Sum(e => e.InnerText.Length);
                        points.Add(new CommentMarker(index, position, marker is W.CommentRangeStart ? "start" : marker is W.CommentRangeEnd ? "end" : "reference"));
                    }
                    if (child is not W.ParagraphProperties) offset += child.InnerText.Length;
                }
            }
        var result = new List<ImportedComment>();
        var blocked = new HashSet<int>();
        var duplicateIds = comments.GroupBy(c => c.Id?.Value).Where(group => group.Count() > 1).Select(group => group.Key).ToHashSet();
        foreach (var comment in comments)
        {
            string id = comment.Id?.Value ?? throw new Exception("A Word comment has no identifier.");
            var points = markers.GetValueOrDefault(id) ?? [];
            var starts = points.Where(p => p.Kind == "start").ToArray();
            var ends = points.Where(p => p.Kind == "end").ToArray();
            var references = points.Where(p => p.Kind == "reference").ToArray();
            var ranges = new List<CommentRange>();
            bool supported = false;
            if (starts.Length == 1 && ends.Length == 1 && (starts[0].Index < ends[0].Index
                || starts[0].Index == ends[0].Index && starts[0].Offset <= ends[0].Offset))
            {
                supported = true;
                for (int index = starts[0].Index; index <= ends[0].Index; index++)
                {
                    if (source[index] is not W.Paragraph p || !CommentParagraph(p)) { supported = false; continue; }
                    ranges.Add(new CommentRange(index, index == starts[0].Index ? starts[0].Offset : 0,
                        index == ends[0].Index ? ends[0].Offset : p.InnerText.Length));
                }
            }
            else if (starts.Length == 0 && ends.Length == 0 && references.Length == 1
                && source[references[0].Index] is W.Paragraph p && CommentParagraph(p))
            {
                ranges.Add(new CommentRange(references[0].Index, references[0].Offset, references[0].Offset)); supported = true;
            }
            supported &= !duplicateIds.Contains(id);
            if (!supported) foreach (var point in points) blocked.Add(point.Index);
            result.Add(new ImportedComment(id, string.Join("\n", comment.Elements<W.Paragraph>().Select(p => p.InnerText)), ranges.ToArray(), supported));
        }
        // A range with no comment body must remain opaque, including its markers.
        foreach (var unknown in markers.Where(pair => !comments.Any(c => c.Id?.Value == pair.Key)))
            foreach (var point in unknown.Value) blocked.Add(point.Index);
        bool changed;
        do
        {
            changed = false;
            for (int index = 0; index < result.Count; index++)
            {
                var comment = result[index];
                if (!comment.Editable || !comment.Ranges.Any(range => blocked.Contains(range.SourceIndex))) continue;
                result[index] = comment with { Editable = false };
                foreach (var point in markers.GetValueOrDefault(comment.Id) ?? []) changed |= blocked.Add(point.Index);
            }
        } while (changed);
        var supportedIds = result.Where(c => c.Editable).Select(c => c.Id).ToHashSet();
        foreach (var paragraph in source.OfType<W.Paragraph>().Where(p => CommentParagraph(p)))
        {
            foreach (var marker in paragraph.Descendants().Where(e => e is W.CommentRangeStart or W.CommentRangeEnd or W.CommentReference).ToArray())
                if (supportedIds.Contains(marker.GetAttribute("id", "http://schemas.openxmlformats.org/wordprocessingml/2006/main").Value ?? "")) marker.Remove();
            foreach (var run in paragraph.Elements<W.Run>().Where(r => r.ChildElements.All(e => e is W.RunProperties)).ToArray()) run.Remove();
        }
        return result.ToArray();
    }
}
