import { PDFDict, PDFDocument, PDFName, PDFRef, PDFStream } from "pdf-lib";

/** Scrub the caller-owned conversion result; the shared converter/cache stays untouched. */
export async function cleanPdf(bytes: Uint8Array, signal: AbortSignal) {
  signal.throwIfAborted();
  if (bytes.byteLength > 32 * 1024 * 1024) throw new Error("The PDF exceeds this delivery's 32 MiB output limit.");
  const document = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  const info = document.context.trailerInfo.Info;
  delete document.context.trailerInfo.Info;
  if (info instanceof PDFRef) document.context.delete(info);
  document.catalog.delete(PDFName.of("Metadata"));
  for (const [reference, object] of document.context.enumerateIndirectObjects()) {
    const dictionary = object instanceof PDFStream ? object.dict : object instanceof PDFDict ? object : undefined;
    if (!dictionary) continue;
    dictionary.delete(PDFName.of("Metadata"));
    if (dictionary.get(PDFName.of("Type")) === PDFName.of("Annot")
      && dictionary.get(PDFName.of("Subtype")) !== PDFName.of("Widget"))
      for (const name of ["T", "M", "CreationDate", "Subj"]) dictionary.delete(PDFName.of(name));
    if (dictionary.get(PDFName.of("Type")) === PDFName.of("Metadata")) document.context.delete(reference);
  }
  signal.throwIfAborted();
  const output = await document.save({ useObjectStreams: true, addDefaultPage: false });
  if (output.byteLength > 32 * 1024 * 1024) throw new Error("The PDF exceeds this delivery's 32 MiB output limit.");
  signal.throwIfAborted();
  const checked = await PDFDocument.load(output, { updateMetadata: false, throwOnInvalidObject: true });
  if (checked.context.trailerInfo.Info || checked.catalog.has(PDFName.of("Metadata"))
    || checked.context.enumerateIndirectObjects().some(([, object]) => {
      const dictionary = object instanceof PDFStream ? object.dict : object instanceof PDFDict ? object : undefined;
      return dictionary?.has(PDFName.of("Metadata")) || dictionary?.get(PDFName.of("Type")) === PDFName.of("Metadata")
        || dictionary?.get(PDFName.of("Type")) === PDFName.of("Annot") && dictionary.get(PDFName.of("Subtype")) !== PDFName.of("Widget")
          && ["T", "M", "CreationDate", "Subj"].some(name => dictionary.has(PDFName.of(name)));
    })) throw new Error("The final PDF still contains optional Info/XMP metadata.");
  return { bytes: output, pages: checked.getPageCount() };
}
