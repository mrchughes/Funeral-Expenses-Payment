# Monitoring Stack for Funeral Expenses Payment

This directory contains the configuration for the monitoring stack used to monitor the Funeral Expenses Payment application and its microservices.

## Components

The monitoring stack includes:

- **Elasticsearch**: For storing and indexing logs
- **Logstash**: For log processing and enrichment
- **Kibana**: For log visualization and analysis
- **Filebeat**: For collecting logs from Docker containers
- **Prometheus**: For metrics collection
- **Grafana**: For metrics visualization and dashboards

## Setup Instructions

### Prerequisites

- Docker and Docker Compose installed
- The main application services should be running

### Installation

1. Install required npm packages:

```bash
cd monitoring
npm install
```

2. Start the monitoring stack:

```bash
npm run start-monitoring
# Or directly run
./scripts/start-monitoring.sh
```

3. Access the monitoring tools:
   - Kibana: http://localhost:5601
   - Grafana: http://localhost:3030 (default credentials: admin/admin)
   - Prometheus: http://localhost:9090

### Configuring Kibana

On first access to Kibana, you'll need to:

1. Go to Management > Stack Management > Index Patterns
2. Create an index pattern with pattern `funeral-expenses-payment-*`
3. Select `@timestamp` as the time field
4. Click "Create index pattern"
5. Go to "Discover" to start viewing logs

### Configuring Grafana

Grafana comes pre-configured with:

1. Datasources for Prometheus and Elasticsearch
2. Default dashboards for Docker, Node.js, and our custom metrics

## Log Integration

### Adding Structured Logging to a Service

Import and use the shared logger module:

```javascript
const { logger, requestLogger, errorLogger } = require('../shared/structured-logger');

// In your Express app setup
app.use(requestLogger);

// At the end of your middleware chain
app.use(errorLogger);

// Usage examples
logger.info('Application started', { port: 3000 });
logger.error('Database connection failed', new Error('Connection timeout'));
```

### Adding Metrics to a Service

Import and use the shared metrics module:

```javascript
const { metricsMiddleware, metricsEndpoint, trackDocumentProcessing } = require('../shared/metrics');

// In your Express app setup
app.use(metricsMiddleware);

// Add a metrics endpoint
app.get('/metrics', metricsEndpoint);

// Track custom metrics
app.post('/api/documents', (req, res) => {
  // Your document handling logic
  
  // Track document processing
  trackDocumentProcessing(req.body.documentType, 'received');
});
```

## Troubleshooting

### Logs Not Appearing in Kibana

1. Check Filebeat is running: `docker-compose -f docker-compose.monitoring.yml ps filebeat`
2. Check Logstash is receiving logs: `docker-compose -f docker-compose.monitoring.yml logs logstash`
3. Verify your index pattern in Kibana is correct
4. Make sure your services are outputting logs to stdout/stderr

### Metrics Not Appearing in Grafana

1. Check if Prometheus is scraping the targets: Go to http://localhost:9090/targets
2. Make sure your services expose a `/metrics` endpoint
3. Verify the service names in prometheus.yml match your actual service names

## Stopping the Stack

```bash
npm run stop-monitoring
# Or directly run
docker-compose -f docker-compose.monitoring.yml down
```

To completely remove all data volumes as well:

```bash
docker-compose -f docker-compose.monitoring.yml down -v
```
