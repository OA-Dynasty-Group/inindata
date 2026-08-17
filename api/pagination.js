// api/pagination.js - Pagination, filtering, and sorting utilities

/**
 * Parse pagination parameters from query string
 */
function parsePaginationParams(url) {
  const params = new URL(url, 'http://localhost').searchParams;
  
  return {
    page: Math.max(1, parseInt(params.get('page')) || 1),
    limit: Math.min(100, Math.max(1, parseInt(params.get('limit')) || 50)), // Min 1, max 100
    sort: params.get('sort') || null,
    search: params.get('search') || null,
    filter: parseFilterParams(params)
  };
}

/**
 * Parse filter parameters from query string
 * Supports: status=active, status=active&status=inactive (multi-value)
 */
function parseFilterParams(params) {
  const filters = {};
  
  for (const [key, value] of params.entries()) {
    if (['page', 'limit', 'sort', 'search'].includes(key)) continue;
    
    if (!filters[key]) {
      filters[key] = [];
    }
    filters[key].push(value);
  }
  
  return filters;
}

/**
 * Apply filters to array of items
 */
function applyFilters(items, filters, fieldMap = {}) {
  if (!filters || Object.keys(filters).length === 0) return items;
  
  return items.filter(item => {
    for (const [field, values] of Object.entries(filters)) {
      const fieldKey = fieldMap[field] || field;
      const itemValue = item[fieldKey];
      
      // Check if item value matches any of the filter values
      if (!values.includes(String(itemValue))) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Apply search across multiple fields
 */
function applySearch(items, query, searchFields = []) {
  if (!query || searchFields.length === 0) return items;
  
  const lowerQuery = query.toLowerCase();
  
  return items.filter(item => {
    return searchFields.some(field => {
      const value = item[field];
      if (!value) return false;
      return String(value).toLowerCase().includes(lowerQuery);
    });
  });
}

/**
 * Apply sorting to array
 * sort=name (ascending)
 * sort=-name (descending, prefix with -)
 */
function applySorting(items, sortParam, defaultSort = 'id') {
  if (!sortParam) {
    sortParam = defaultSort;
  }
  
  let field = sortParam;
  let descending = false;
  
  if (sortParam.startsWith('-')) {
    field = sortParam.slice(1);
    descending = true;
  }
  
  const sorted = [...items].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    
    // Handle null/undefined
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return descending ? -1 : 1;
    if (bVal == null) return descending ? 1 : -1;
    
    // Handle dates
    if (aVal instanceof Date && bVal instanceof Date) {
      return descending
        ? bVal.getTime() - aVal.getTime()
        : aVal.getTime() - bVal.getTime();
    }
    
    // Handle strings
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      const comparison = aVal.localeCompare(bVal);
      return descending ? -comparison : comparison;
    }
    
    // Handle numbers
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return descending ? bVal - aVal : aVal - bVal;
    }
    
    // Default comparison
    return descending ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
  });
  
  return sorted;
}

/**
 * Paginate array and return paginated result with metadata
 */
function paginate(items, page, limit) {
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const end = start + limit;
  
  return {
    data: items.slice(start, end),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

/**
 * Apply full query pipeline: filter → search → sort → paginate
 */
function applyQuery(items, options = {}) {
  const {
    filters = {},
    search = null,
    searchFields = [],
    sort = null,
    page = 1,
    limit = 50,
    fieldMap = {}
  } = options;
  
  // Apply filters
  let filtered = applyFilters(items, filters, fieldMap);
  
  // Apply search
  if (search) {
    filtered = applySearch(filtered, search, searchFields);
  }
  
  // Apply sorting
  let sorted = applySorting(filtered, sort);
  
  // Apply pagination
  return paginate(sorted, page, limit);
}

/**
 * Format paginated response for JSON
 */
function formatResponse(result) {
  return {
    items: result.data,
    pagination: result.pagination
  };
}

/**
 * CURSOR-BASED PAGINATION
 * More efficient for large datasets and real-time data
 * Cursor = base64-encoded ID of the last item in the previous page
 */

/**
 * Encode ID to cursor (base64)
 */
function encodeCursor(id) {
  return Buffer.from(id).toString('base64');
}

/**
 * Decode cursor back to ID
 */
function decodeCursor(cursor) {
  try {
    return Buffer.from(cursor, 'base64').toString('utf8');
  } catch (err) {
    return null;
  }
}

/**
 * Parse cursor-based pagination parameters from query string
 * Supports: cursor=<base64-encoded-id>&limit=50
 * cursor should be the ID of the last item from the previous page
 */
function parseCursorParams(url) {
  const params = new URL(url, 'http://localhost').searchParams;
  
  return {
    cursor: params.get('cursor') || null,
    limit: Math.min(100, Math.max(1, parseInt(params.get('limit')) || 50)),
    sort: params.get('sort') || null,
    search: params.get('search') || null,
    filter: parseFilterParams(params)
  };
}

/**
 * Apply cursor-based pagination to sorted array
 * Items must be sorted before calling this function
 * Returns: { data, cursor: { nextCursor, hasPrev, hasNext } }
 */
function applyCursorPagination(items, cursor, limit, sortField = 'id') {
  let startIndex = 0;
  
  // If cursor provided, find the item and start after it
  if (cursor) {
    const decodedId = decodeCursor(cursor);
    if (!decodedId) {
      return {
        data: [],
        cursor: {
          nextCursor: null,
          hasPrev: false,
          hasNext: false,
          total: items.length
        }
      };
    }
    
    // Find the index of the item with the cursor ID
    startIndex = items.findIndex(item => String(item.id) === decodedId);
    if (startIndex === -1) {
      // Cursor item not found (might have been deleted), return empty
      return {
        data: [],
        cursor: {
          nextCursor: null,
          hasPrev: false,
          hasNext: false,
          total: items.length
        }
      };
    }
    
    // Start from the next item
    startIndex++;
  }
  
  // Get the page of items
  const pageEnd = startIndex + limit;
  const pageItems = items.slice(startIndex, pageEnd);
  
  // Determine if there are more items before/after
  const hasPrev = startIndex > 0;
  const hasNext = pageEnd < items.length;
  
  // Generate next cursor from last item in page
  let nextCursor = null;
  if (pageItems.length > 0 && hasNext) {
    const lastItem = pageItems[pageItems.length - 1];
    nextCursor = encodeCursor(lastItem.id);
  }
  
  return {
    data: pageItems,
    cursor: {
      nextCursor,
      hasPrev,
      hasNext,
      total: items.length
    }
  };
}

/**
 * Apply full cursor-based query pipeline: filter → search → sort → cursor paginate
 */
function applyQueryWithCursor(items, options = {}) {
  const {
    filters = {},
    search = null,
    searchFields = [],
    sort = null,
    cursor = null,
    limit = 50,
    fieldMap = {}
  } = options;
  
  // Apply filters
  let filtered = applyFilters(items, filters, fieldMap);
  
  // Apply search
  if (search) {
    filtered = applySearch(filtered, search, searchFields);
  }
  
  // Apply sorting
  let sorted = applySorting(filtered, sort);
  
  // Apply cursor pagination
  return applyCursorPagination(sorted, cursor, limit);
}

/**
 * Format cursor-based paginated response for JSON
 */
function formatCursorResponse(result) {
  return {
    items: result.data,
    pagination: result.cursor
  };
}

// Public API
module.exports = {
  parsePaginationParams,
  parseFilterParams,
  applyFilters,
  applySearch,
  applySorting,
  paginate,
  applyQuery,
  formatResponse,
  // Cursor-based pagination
  encodeCursor,
  decodeCursor,
  parseCursorParams,
  applyCursorPagination,
  applyQueryWithCursor,
  formatCursorResponse
};
