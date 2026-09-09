const { classifyResourceType } = require('./metrics-calculator.js');

class NetworkTracker {
  constructor(options = {}) {
    const opts = options || {};
    this.maxItems = opts.maxItems || 2000;
    this.requests = new Map();
    this.orderedIds = [];
    this.redirectCounts = new Map();
    this.stats = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      totalBytes: 0,
      typeCounts: {
        all: 0,
        fetch: 0,
        script: 0,
        stylesheet: 0,
        image: 0,
        font: 0,
        document: 0,
        media: 0,
        other: 0
      }
    };
  }

  reset() {
    this.requests.clear();
    this.orderedIds = [];
    this.redirectCounts.clear();
    this.stats = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      totalBytes: 0,
      typeCounts: {
        all: 0,
        fetch: 0,
        script: 0,
        stylesheet: 0,
        image: 0,
        font: 0,
        document: 0,
        media: 0,
        other: 0
      }
    };
  }

  onRequestWillBeSent(params) {
    if (!params || !params.request || !params.requestId) return null;

    let id = params.requestId;

    // Handle HTTP Redirects: If requestId exists and redirectResponse is provided, preserve original hop
    if (this.requests.has(id) && params.redirectResponse) {
      const prev = this.requests.get(id);
      prev.statusCode = params.redirectResponse.status || 302;
      prev.status = 'completed';

      const count = (this.redirectCounts.get(id) || 0) + 1;
      this.redirectCounts.set(id, count);
      id = `${params.requestId}#r${count}`;
    }

    const { request, type, timestamp, wallTime } = params;
    const category = classifyResourceType(type, '');

    const record = {
      id,
      originalId: params.requestId,
      url: request.url || '',
      method: (request.method || 'GET').toUpperCase(),
      type: type || 'Other',
      category,
      statusCode: null,
      statusText: '',
      mimeType: '',
      status: 'pending',
      startMonotonic: typeof timestamp === 'number' ? timestamp : 0,
      wallTime: typeof wallTime === 'number' ? wallTime : Date.now() / 1000,
      durationMs: 0,
      encodedDataLength: 0,
      errorText: null,
      initiator: params.initiator ? params.initiator.type : null,
      requestHeaders: (request.headers && typeof request.headers === 'object' && !Array.isArray(request.headers)) ? { ...request.headers } : {},
      responseHeaders: {},
      protocol: '',
      remoteIPAddress: '',
      postData: request.postData || null
    };

    if (!this.requests.has(id)) {
      if (this.orderedIds.length >= this.maxItems) {
        const oldestId = this.orderedIds.shift();
        const oldItem = this.requests.get(oldestId);
        if (oldItem && this.stats.typeCounts[oldItem.category] > 0) {
          this.stats.typeCounts[oldItem.category]--;
          this.stats.typeCounts.all--;
        }
        this.requests.delete(oldestId);
      }
      this.orderedIds.push(id);
      this.stats.totalRequests++;
      this.stats.typeCounts.all++;
      if (this.stats.typeCounts[category] !== undefined) {
        this.stats.typeCounts[category]++;
      } else {
        this.stats.typeCounts.other++;
      }
    }

    this.requests.set(id, record);
    return record;
  }

  onResponseReceived(params) {
    if (!params || !params.response || !params.requestId) return null;
    const { requestId, response, type, timestamp } = params;
    const record = this.requests.get(requestId);
    if (!record) return null;

    record.statusCode = response.status || 200;
    record.statusText = response.statusText || 'OK';
    record.mimeType = response.mimeType || '';
    if (response.headers && typeof response.headers === 'object' && !Array.isArray(response.headers)) {
      record.responseHeaders = { ...response.headers };
    }
    if (response.protocol) {
      record.protocol = response.protocol;
    }
    if (response.remoteIPAddress) {
      record.remoteIPAddress = response.remoteIPAddress;
    }

    if (typeof response.encodedDataLength === 'number' && !isNaN(response.encodedDataLength) && response.encodedDataLength > 0) {
      const added = Math.max(0, response.encodedDataLength - record.encodedDataLength);
      record.encodedDataLength = response.encodedDataLength;
      this.stats.totalBytes += added;
    }

    // Re-evaluate category with mimeType
    const updatedCategory = classifyResourceType(type || record.type, response.mimeType);
    if (updatedCategory !== record.category) {
      if (this.stats.typeCounts[record.category] > 0) {
        this.stats.typeCounts[record.category]--;
      }
      record.category = updatedCategory;
      if (this.stats.typeCounts[updatedCategory] !== undefined) {
        this.stats.typeCounts[updatedCategory]++;
      } else {
        this.stats.typeCounts.other++;
      }
    }

    if (timestamp && record.startMonotonic > 0) {
      record.durationMs = Math.max(0, Math.round((timestamp - record.startMonotonic) * 1000));
    }

    return record;
  }

  onLoadingFinished(params) {
    if (!params || !params.requestId) return null;
    const { requestId, encodedDataLength, timestamp } = params;
    const record = this.requests.get(requestId);
    if (!record) return null;

    if (record.status !== 'completed') {
      this.stats.completedRequests++;
    }
    record.status = 'completed';

    if (typeof encodedDataLength === 'number' && !isNaN(encodedDataLength) && encodedDataLength > 0) {
      const addedBytes = Math.max(0, encodedDataLength - record.encodedDataLength);
      record.encodedDataLength = encodedDataLength;
      this.stats.totalBytes += addedBytes;
    }

    if (timestamp && record.startMonotonic > 0) {
      record.durationMs = Math.max(0, Math.round((timestamp - record.startMonotonic) * 1000));
    }

    return record;
  }

  onLoadingFailed(params) {
    if (!params || !params.requestId) return null;
    const { requestId, errorText, timestamp } = params;
    const record = this.requests.get(requestId);
    if (!record) return null;

    if (record.status !== 'failed') {
      this.stats.failedRequests++;
    }
    record.status = 'failed';
    record.errorText = errorText || 'Failed';

    if (timestamp && record.startMonotonic > 0) {
      record.durationMs = Math.max(0, Math.round((timestamp - record.startMonotonic) * 1000));
    }

    return record;
  }

  getRequests() {
    return this.orderedIds.map(id => this.requests.get(id)).filter(Boolean);
  }

  getStats() {
    return { ...this.stats };
  }

  filter({ category = 'all', search = '', status = 'all' } = {}) {
    const s = (search || '').toLowerCase().trim();
    const cat = (category || 'all').toLowerCase();
    const stat = (status || 'all').toLowerCase();

    return this.getRequests().filter(req => {
      if (!req) return false;
      if (cat !== 'all' && req.category !== cat) return false;
      if (stat !== 'all' && req.status !== stat) return false;
      if (s) {
        const reqUrl = (req.url || '').toLowerCase();
        const reqMethod = (req.method || '').toLowerCase();
        if (!reqUrl.includes(s) && !reqMethod.includes(s)) {
          return false;
        }
      }
      return true;
    });
  }
}

module.exports = { NetworkTracker };
