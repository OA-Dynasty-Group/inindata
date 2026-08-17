// Analytics with date filtering and multiple chart types
// Extends existing analytics functionality with date range selection and Chart.js visualizations

App.state.currentDateRange = '30';
App.state.currentChartType = 'bar';
App.state.lastAggregation = null;
App.state.lastTrendData = null;

/**
 * Render bar chart from aggregation result (original bar chart)
 */
App.charts.renderBarChart = function(aggregation) {
  const chart = document.getElementById('barChart');
  const maxValue = Math.max(...aggregation.groups.map(g => g.value), 1);
  chart.innerHTML = aggregation.groups.map(group => {
    const percentage = (group.value / maxValue) * 100;
    return `<div class="bar" style="--value: ${percentage}">
      <span>${group.value}</span>
      <label>${group.label || '(empty)'}</label>
    </div>`;
  }).join('');
};

/**
 * Enhanced analytics loader with date filtering and chart type selection
 */
async function loadAnalyticsWithDateFilter() {
  try {
    if (!App.state.activeDataset) {
      const response = await fetch(`/api/instruments/${App.state.form.id}/dataset`);
      App.state.activeDataset = await response.json();
    }

    const dimension = document.getElementById('dimensionSelect').value || App.state.activeDataset.columns[0]?.key;
    if (!dimension) {
      document.getElementById('chartEmpty').hidden = false;
      document.getElementById('chartTitle').textContent = 'No fields to analyze';
      return;
    }

    App.state.currentChartType = document.getElementById('chartTypeSelect').value || 'bar';

    const url = `/api/instruments/${App.state.form.id}/analytics?dimension=${encodeURIComponent(dimension)}&dateRange=${encodeURIComponent(App.state.currentDateRange)}`;
    const response = await fetch(url);
    const aggregation = await response.json();
    if (!response.ok) throw new Error(aggregation.error);

    App.state.lastAggregation = aggregation;

    if (App.state.currentChartType === 'line') {
      if (!App.state.activeDataset.records) {
        const datasetResponse = await fetch(`/api/instruments/${App.state.form.id}/dataset`);
        App.state.activeDataset = await datasetResponse.json();
      }

      let filteredSubmissions = App.state.activeDataset.records;
      if (App.state.currentDateRange !== 'all') {
        const days = parseInt(App.state.currentDateRange);
        if (days > 0) {
          const cutoffDate = new Date(Date.now() - days * 86400000);
          filteredSubmissions = App.state.activeDataset.records.filter(r => new Date(r.submittedAt) >= cutoffDate);
        }
      }

      App.state.lastTrendData = App.charts.generateTrendData(filteredSubmissions, App.state.currentDateRange);
      App.charts.switchChartType('line', null, App.state.lastTrendData);
      document.getElementById('chartTitle').textContent = 'Response Trends Over Time';
    } else {
      App.charts.switchChartType(App.state.currentChartType, aggregation, null);
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

  if (!selector) return;

  selector.addEventListener('change', (e) => {
    App.state.currentDateRange = e.target.value;
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

  dimensionSelect.addEventListener('change', loadAnalyticsWithDateFilter);

  chartTypeSelect.addEventListener('change', (e) => {
    App.state.currentChartType = e.target.value;
    loadAnalyticsWithDateFilter();
  });

  customFrom.addEventListener('change', () => {
    if (selector.value === 'custom') {
      App.state.currentDateRange = `custom:${customFrom.value}:${customTo.value}`;
      loadAnalyticsWithDateFilter();
    }
  });

  customTo.addEventListener('change', () => {
    if (selector.value === 'custom') {
      App.state.currentDateRange = `custom:${customFrom.value}:${customTo.value}`;
      loadAnalyticsWithDateFilter();
    }
  });
}

App.analytics = {
  load: loadAnalyticsWithDateFilter,
  setupDateFiltering: setupDateFiltering
};
