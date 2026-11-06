using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using W = DocumentFormat.OpenXml.Wordprocessing;

static partial class Program
{
    record CommentRange(int SourceIndex, int From, int To);
    record ImportedComment(string Id, string Text, CommentRange[] Ranges, bool Editable);
    record CommentMarker(int Index, int Offset, string Kind);

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
