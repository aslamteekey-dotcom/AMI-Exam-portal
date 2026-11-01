import html2pdf from 'html2pdf.js';

export interface ScoreSheetPdfOptions {
  element: HTMLElement | null;
  filename?: string;
  onSuccess?: () => void;
  onError?: (err: any) => void;
}

/**
 * Exports the score sheet container element strictly as A4 Landscape PDF.
 * Configured with margin: [5, 5, 5, 5] mm.
 * Respects .print:hidden and .print:block classes to exclude unnecessary UI elements
 * and display the official print header, mirroring the native print preview.
 */
export async function exportScoreSheetToPdf({
  element,
  filename = 'Score_Sheet.pdf',
  onSuccess,
  onError,
}: ScoreSheetPdfOptions): Promise<void> {
  if (!element) {
    console.warn('exportScoreSheetToPdf: target element is missing. Falling back to native print.');
    window.print();
    return;
  }

  const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  // Temporarily mark the element as active for PDF export
  element.classList.add('pdf-export-active');
  document.body.classList.add('pdf-export-active');

  const opt = {
    margin: [5, 5, 5, 5] as [number, number, number, number],
    filename: safeFilename,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      scrollY: 0,
      logging: false,
      onclone: (clonedDoc: Document) => {
        // 1. Hide all elements with print:hidden
        const printHiddenEls = clonedDoc.querySelectorAll('.print\\:hidden');
        printHiddenEls.forEach(el => {
          (el as HTMLElement).style.setProperty('display', 'none', 'important');
        });

        // 2. Show all elements with print:block or score-sheet-print-header
        const printBlockEls = clonedDoc.querySelectorAll('.print\\:block, .score-sheet-print-header');
        printBlockEls.forEach(el => {
          (el as HTMLElement).style.setProperty('display', 'block', 'important');
        });

        // 3. Ensure horizontal scroll containers expand fully to landscape width
        const overflowEls = clonedDoc.querySelectorAll('.overflow-x-auto');
        overflowEls.forEach(el => {
          (el as HTMLElement).style.setProperty('overflow', 'visible', 'important');
          (el as HTMLElement).style.setProperty('width', '100%', 'important');
        });
      },
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'landscape' as const,
    },
  };

  try {
    await html2pdf().set(opt).from(element).save();
    if (onSuccess) onSuccess();
  } catch (err) {
    console.warn('html2pdf generation failed, falling back smoothly to window.print():', err);
    if (onError) onError(err);
    window.print();
  } finally {
    element.classList.remove('pdf-export-active');
    document.body.classList.remove('pdf-export-active');
  }
}
