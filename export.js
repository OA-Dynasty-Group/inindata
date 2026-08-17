// export.js - Export analytics as image, PDF, or CSV

App.export = {};

async function exportChartAsImage() {
  try {
    const chartType = document.getElementById('chartTypeSelect').value;
    const title = document.getElementById('chartTitle').textContent;
    const chartContainer = document.getElementById('chartContainer');

    toast('Generating image...');

    const canvas = await html2canvas(chartContainer, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false
    });

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `chart-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast('Chart exported as PNG');
    });
  } catch (error) {
    toast(`Export failed: ${error.message}`);
  }
}

async function exportChartAsPDF() {
  try {
    const jsPDF = window.jspdf.jsPDF;
    const title = document.getElementById('chartTitle').textContent;
    const total = document.getElementById('chartTotal').textContent;
    const dimension = document.getElementById('dimensionSelect').selectedOptions[0].text;
    const dateRange = document.getElementById('dateRangeSelect').selectedOptions[0].text;

    toast('Generating PDF...');

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    pdf.setFontSize(18);
    pdf.text('Analytics Report', 20, 20);

    pdf.setFontSize(11);
    pdf.setTextColor(100);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 20, 28);

    pdf.setFontSize(10);
    pdf.setTextColor(0);
    let yPos = 40;
    pdf.text(`Chart: ${title}`, 20, yPos);
    yPos += 7;
    pdf.text(`Total Responses: ${total}`, 20, yPos);
    yPos += 7;
    pdf.text(`Dimension: ${dimension}`, 20, yPos);
    yPos += 7;
    pdf.text(`Date Range: ${dateRange}`, 20, yPos);
    yPos += 15;

    const chartContainer = document.getElementById('chartContainer');
    const canvas = await html2canvas(chartContainer, {
      backgroundColor: '#ffffff',
      scale: 1.5,
      logging: false
    });

    const imgWidth = 180;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (yPos + imgHeight > 270) {
      pdf.addPage();
      yPos = 20;
    }

    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 15, yPos, imgWidth, imgHeight);

    if (App.state.lastAggregation && App.state.lastAggregation.groups) {
      pdf.addPage();
      pdf.setFontSize(12);
      pdf.text('Data Breakdown', 20, 20);

      pdf.setFontSize(9);
      let tableY = 30;
      pdf.text('Value', 20, tableY);
      pdf.text('Count', 100, tableY);
      pdf.text('Percentage', 140, tableY);

      tableY += 5;
      const totalRows = App.state.lastAggregation.total;

      App.state.lastAggregation.groups.forEach((group, index) => {
        if (tableY > 270) {
          pdf.addPage();
          tableY = 20;
        }

        const percentage = ((group.value / totalRows) * 100).toFixed(1);
        pdf.text(String(group.label || '(empty)').slice(0, 60), 20, tableY);
        pdf.text(String(group.value), 100, tableY);
        pdf.text(`${percentage}%`, 140, tableY);
        tableY += 5;
      });
    }

    pdf.save(`analytics-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast('Report exported as PDF');
  } catch (error) {
    toast(`Export failed: ${error.message}`);
  }
}

function exportChartAsCSV() {
  try {
    if (!App.state.lastAggregation || !App.state.lastAggregation.groups) {
      toast('No data to export');
      return;
    }

    const title = document.getElementById('chartTitle').textContent;
    const dimension = document.getElementById('dimensionSelect').selectedOptions[0].text;
    const dateRange = document.getElementById('dateRangeSelect').selectedOptions[0].text;
    const total = App.state.lastAggregation.total;

    let csv = `Analytics Export\n`;
    csv += `Generated,${new Date().toISOString()}\n`;
    csv += `Chart,${title}\n`;
    csv += `Dimension,${dimension}\n`;
    csv += `Date Range,${dateRange}\n`;
    csv += `Total Responses,${total}\n`;
    csv += `\n`;
    csv += `Value,Count,Percentage\n`;

    App.state.lastAggregation.groups.forEach(group => {
      const percentage = ((group.value / total) * 100).toFixed(1);
      const label = String(group.label || '(empty)').replace(/"/g, '""');
      csv += `"${label}",${group.value},${percentage}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast('Data exported as CSV');
  } catch (error) {
    toast(`Export failed: ${error.message}`);
  }
}

function setupExportButtons() {
  const exportImageBtn = document.getElementById('exportChartImage');
  const exportPdfBtn = document.getElementById('exportChartPDF');
  const exportDataBtn = document.getElementById('exportChartData');

  if (exportImageBtn) {
    exportImageBtn.addEventListener('click', exportChartAsImage);
  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', exportChartAsPDF);
  }

  if (exportDataBtn) {
    exportDataBtn.addEventListener('click', exportChartAsCSV);
  }
}

App.export.chartAsImage = exportChartAsImage;
App.export.chartAsPDF = exportChartAsPDF;
App.export.chartAsCSV = exportChartAsCSV;
App.export.setup = setupExportButtons;
