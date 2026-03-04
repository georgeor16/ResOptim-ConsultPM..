/**
 * PDF and PNG export for Gantt chart using html2canvas + jspdf.
 */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export async function exportGanttToPng(
  chartElement: HTMLElement,
  headerTitle: string,
  periodLabel: string
): Promise<Blob> {
  const header = document.createElement('div');
  header.className = 'gantt-export-header';
  header.style.cssText = `
    padding: 8px 12px;
    background: rgba(255,255,255,0.9);
    border-bottom: 1px solid rgba(0,0,0,0.08);
    font-family: system-ui, sans-serif;
    font-size: 12px;
    color: #374151;
  `;
  header.innerHTML = `
    <div style="font-weight: 600;">${escapeHtml(headerTitle)}</div>
    <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${escapeHtml(periodLabel)} · Export: ${new Date().toLocaleString()}</div>
  `;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'background: #fff;';
  wrapper.appendChild(header);
  const clone = chartElement.cloneNode(true) as HTMLElement;
  clone.style.width = chartElement.offsetWidth + 'px';
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  wrapper.style.position = 'absolute';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';

  try {
    const canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    document.body.removeChild(wrapper);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
        'image/png',
        1
      );
    });
  } catch (e) {
    document.body.removeChild(wrapper);
    throw e;
  }
}

export async function exportGanttToPdf(
  chartElement: HTMLElement,
  headerTitle: string,
  periodLabel: string
): Promise<Blob> {
  const header = document.createElement('div');
  header.className = 'gantt-export-header';
  header.style.cssText = `
    padding: 8px 12px;
    background: rgba(255,255,255,0.95);
    border-bottom: 1px solid rgba(0,0,0,0.08);
    font-family: system-ui, sans-serif;
    font-size: 12px;
    color: #374151;
  `;
  header.innerHTML = `
    <div style="font-weight: 600;">${escapeHtml(headerTitle)}</div>
    <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${escapeHtml(periodLabel)} · Export: ${new Date().toLocaleString()}</div>
  `;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'background: #fff;';
  wrapper.appendChild(header);
  const clone = chartElement.cloneNode(true) as HTMLElement;
  clone.style.width = chartElement.offsetWidth + 'px';
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  wrapper.style.position = 'absolute';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';

  try {
    const canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    document.body.removeChild(wrapper);

    const imgData = canvas.toDataURL('image/png', 1);
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentW = pageW - 2 * margin;
    const contentH = pageH - 2 * margin;
    const ratio = canvas.height / canvas.width;
    const imgH = Math.min(contentH, contentW * ratio);
    const imgW = imgH / ratio;
    pdf.addImage(imgData, 'PNG', margin, margin, imgW, imgH);
    return pdf.output('blob');
  } catch (e) {
    document.body.removeChild(wrapper);
    throw e;
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
