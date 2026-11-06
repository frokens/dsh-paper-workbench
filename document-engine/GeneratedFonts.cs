using DocumentFormat.OpenXml.Packaging;
using W = DocumentFormat.OpenXml.Wordprocessing;

static partial class Program
{
    // Only newly authored/converted files use these defaults. Uploaded DOCX
    // fonts and complete native styles remain the original source's property.
    static void GeneratedFonts(MainDocumentPart main)
    {
        var part = main.StyleDefinitionsPart ?? main.AddNewPart<StyleDefinitionsPart>();
        var styles = part.Styles ??= new W.Styles();
        var defaults = styles.DocDefaults ??= new W.DocDefaults();
        var runs = defaults.RunPropertiesDefault ??= new W.RunPropertiesDefault();
        var properties = runs.RunPropertiesBaseStyle ??= new W.RunPropertiesBaseStyle();
        var fonts = properties.RunFonts ??= new W.RunFonts();
        fonts.Ascii = "Times New Roman"; fonts.HighAnsi = "Times New Roman";
        fonts.AsciiTheme = null; fonts.HighAnsiTheme = null;
        properties.FontSize ??= new W.FontSize { Val = "24" };
        var document = main.Document ?? throw new Exception("Missing generated Word document.");
        foreach (var font in styles.Descendants<W.RunFonts>().Concat(document.Descendants<W.RunFonts>()))
        {
            font.EastAsia = "Songti SC"; font.EastAsiaTheme = null;
        }
        styles.Save();
    }
}
