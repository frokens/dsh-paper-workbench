using System.Text.Json;
using System.Xml;
using System.Xml.Linq;
using DocumentFormat.OpenXml.Packaging;

static partial class Program
{
    const string DeliveryNamespace = "urn:paper-workbench:delivery";
    record DeliveryMarker(string? Id, string? PaperId);

    static DeliveryMarker? ReadDeliveryMarker(CustomXmlPart part)
    {
        bool owned = false;
        try
        {
            using var stream = part.GetStream();
            using var reader = XmlReader.Create(stream, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null, MaxCharactersInDocument = 1_000_000 });
            reader.MoveToContent();
            owned = reader.NamespaceURI == DeliveryNamespace;
            if (!owned) return null;
            var element = XElement.Load(reader);
            return new DeliveryMarker((string?)element.Attribute("id"), (string?)element.Attribute("paperId"));
        }
        catch (XmlException) { return owned ? new DeliveryMarker(null, null) : null; } // Unrelated custom data remains opaque.
    }

    static void StampDelivery(MainDocumentPart main, JsonElement request)
    {
        foreach (var part in main.CustomXmlParts.Where(part => ReadDeliveryMarker(part) != null).ToArray()) main.DeletePart(part);
        if (!request.TryGetProperty("delivery", out var supplied)) return;
        var partCreated = main.AddCustomXmlPart(CustomXmlPartType.CustomXml);
        using var output = partCreated.GetStream(FileMode.Create, FileAccess.Write);
        new XDocument(new XElement(XName.Get("delivery", DeliveryNamespace),
            new XAttribute("id", supplied.GetProperty("id").GetString()!),
            new XAttribute("paperId", supplied.GetProperty("paperId").GetString()!))).Save(output);
    }
}
