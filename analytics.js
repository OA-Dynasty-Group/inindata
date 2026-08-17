// Analytics with date filtering and multiple chart types
// Extends existing analytics functionality with date range selection and Chart.js visualizations

let currentDateRange = '30'; // Default: last 30 days
let currentChartType = 'bar'; // Default chart type
let lastAggregation = null; // Cache aggregation for chart type switching
let lastTrendData = null; // Cache trend data for chart type switching

/**
 * Enhanced analytics loader with date filtering and chart type selection
 */
async function loadAnalyticsWithDateFilter() {
  try {
    if (!activeDataset) {
      const response = await fetch(`/api/instruments/${form.id}/dataset`);
      activeDataset = await response.json();
    }

    const dimension = document.getElementById('dimensionSelect').value || activeDataset.columns[0]?.key;
    if (!dimension) {
      document.getElementById('chartEmpty').hidden = false;
      document.getElementById('chartTitle').textContent = 'No fields to analyze';
      return;
    }

    currentChartType = document.getElementById('chartTypeSelect').value || 'bar';

    // Fetch aggregation data (for bar and pie charts)
    const url = `/api/instruments/${form.id}/analytics?dimension=${encodeURIComponent(dimension)}&dateRange=${encodeURIComponent(currentDateRange)}`;
    const response = await fetch(url);
    const aggregation = await response.json();
    if (!response.ok) throw new Error(aggregation.error);

    lastAggregation = aggregation;

    // Generate trend data from raw submissions (for line charts)
    if (currentChartType === 'line') {
      if (!activeDataset.records) {
        const datasetResponse = await fetch(`/api/instruments/${form.id}/dataset`);
        activeDataset = await datasetResponse.json();
      }
      
      // Filter by date range
      let filteredSubmissions = activeDataset.records;
      if (currentDateRange !== 'all') {
        const days = parseInt(currentDateRange);
        if (days > 0) {
          const cutoffDate = new Date(Date.now() - days * 86400000);
          filteredSubmissions = activeDataset.records.filter(r => new Date(r.submittedAt) >= cutoffDate);
        }
      }
      
      lastTrendData = generateTrendData(filteredSubmissions, currentDateRange);
      switchChartType('line', null, lastTrendData);
      document.getElementById('chartTitle').textContent = 'Response Trends Over Time';
    } else {
      // Bar or Pie chart
      switchChartType(currentChartType, aggregation, null);
      document.getElementById('chartTitle').textContent = `${aggregation.dimension.label} (${aggregation.groups.length} values)`;
    }

    document.getElementById('chartTotal').textContent = `${aggregation.total} total responses`;
    document.getElementById('chartEmpty').hidden = true;
  } catch (error) {
    document.getElementById('chartEmpty').textContent = `Error loading analytics: ${error.message}`;
    document.getElementById('chartEmpty').hidden = false;
  }
}

/**
 * Render bar chart from aggregation result (original bar chart)
 */
function renderBarChart(aggregation) {
  const chart = document.getElementById('barChart');
  const maxValue = Math.max(...aggregation.groups.map(g => g.value), 1);
  chart.innerHTML = aggregation.groups.map(group => {
    const percentage = (group.value / maxValue) * 100;
    return `<div class="bar" style="--value: ${percentage}">
      <span>${group.value}</span>
      <label>${group.label || '(empty)'}</label>
    </div>`;
  }).join('');
}

/**
 * Initialize date range filtering and chart type selection
 */
function setupDateFiltering() {
  const selector = document.getElementById('dateRangeSelect');
  const customFromLabel = document.getElementById('customDateLabel');
  const customToLabel = document.getElementById('customDateToLabel');
  const customFrom = document.getElementById('customDateFrom');
  const customTo = document.getElementById('customDateTo');
  const dimensionSelect = document.getElementById('dimensionSelect');
  const chartTypeSelect = document.getElementById('chartTypeSelect');

  if (!selector) return; // Not loaded yet

  // Handle date range selection changes
  selector.addEventListener('change', (e) => {
    currentDateRange = e.target.value;
    if (e.target.value === 'custom') {
      customFromLabel.hidden = false;
      customToLabel.hidden = false;
      customFrom.focus();
    } else {
      customFromLabel.hidden = true;
      customToLabel.hidden = true;
    }
    loadAnalyticsWithDateFilter();
  });

  // Reload chart when dimension changes
  dimensionSelect.addEventListener('change', loadAnalyticsWithDateFilter);

  // Handle chart type changes
  chartTypeSelect.addEventListener('change', (e) => {
    currentChartType = e.target.value;
    loadAnalyticsWithDateFilter();
  });

  // Reload chart when custom dates change
  customFrom.addEventListener('change', () => {
    if (selector.value === 'custom') {
      currentDateRange = `custom:${customFrom.value}:${customTo.value}`;
      loadAnalyticsWithDateFilter();
    }
  });
  
  customTo.addEventListener('change', () => {
    if (selector.value === 'custom') {
      currentDateRange = `custom:${customFrom.value}:${customTo.value}`;
      loadAnalyticsWithDateFilter();
    }
  });
}

/**
 * Hook into existing page routing
 */
window.addEventListener('hashchange', () => {
  if (location.hash === '#analytics') {
    setupDateFiltering();
    loadAnalyticsWithDateFilter();
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupDateFiltering();
  
  // If already on analytics page, load it
  if (location.hash === '#analytics') {
    loadAnalyticsWithDateFilter();
  }
});

