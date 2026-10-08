# HookFlow
## Reliable Distributed Webhook Delivery Engine

HookFlow is a distributed webhook delivery platform designed to reliably deliver event notifications from an application to customer-controlled HTTP endpoints.

It demonstrates how production-style webhook infrastructure can handle high delivery volume, slow or unavailable customer servers, retries, duplicate deliveries, authentication, observability, and failed jobs.

---

## 🚨 The Problem

Modern applications frequently need to notify external systems when something happens.

For example:

```text
payment.succeeded
order.created
invoice.paid
user.created
subscription.cancelled
```

A naive implementation might send HTTP requests directly from the main application whenever an event occurs.

This approach becomes unreliable when thousands of external endpoints are involved.

Customer servers may:

- respond slowly
- return HTTP errors
- become temporarily unavailable
- timeout
- permanently fail
- process the same request more than once

If the main application performs all webhook requests synchronously, external failures can consume application resources and cause events to be lost or delayed.

---

## 💡 The Solution

HookFlow separates **event creation** from **event delivery** using an asynchronous queue-based architecture.

Instead of:

```text
Application
    ↓
Customer Server
```

HookFlow uses:

```text
Application
    ↓
Webhook API
    ↓
Redis Queue
    ↓
Delivery Workers
    ↓
Customer Server
```

The API accepts an event and queues delivery work without waiting for external customer servers to respond.

Background workers then process deliveries independently.

---

## 🏗️ Architecture

```text
                         ┌─────────────────────┐
                         │   Event Producer    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    HookFlow API     │
                         │ Node.js + TypeScript│
                         └──────────┬──────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
                     ▼                             ▼
             ┌───────────────┐            ┌────────────────┐
             │  PostgreSQL   │            │ Redis / BullMQ │
             │               │            │                │
             │ Events        │            │ Delivery Jobs  │
             │ Subscriptions │            │ Retry Jobs     │
             │ Deliveries    │            │ Delayed Jobs   │
             └───────────────┘            └───────┬────────┘
                                                  │
                                  ┌───────────────┼──────────────┐
                                  ▼               ▼              ▼
                              Worker 1        Worker 2       Worker 3
                                  │               │              │
                                  └───────────────┼──────────────┘
                                                  │
                                             HTTP POST
                                                  │
                         ┌────────────────────────┼──────────────┐
                         ▼                        ▼              ▼
                    Customer A               Customer B     Customer C
                       200                      500            Timeout
                         │                       │                │
                         ▼                       ▼                ▼
                      SUCCESS                  RETRY            RETRY
                                                  │                │
                                                  └───────┬────────┘
                                                          ▼
                                                  Exponential Backoff
                                                          │
                                                          ▼
                                                         DLQ
```

---

## ✨ Features

### Event Ingestion

Applications can submit events through the API.

Example:

```http
POST /events
```

```json
{
  "type": "payment.succeeded",
  "data": {
    "paymentId": "pay_123",
    "amount": 1500,
    "currency": "INR"
  }
}
```

---

### Webhook Subscriptions

Customers can register webhook endpoints and choose which event types they want to receive.

```http
POST /subscriptions
```

---

### Asynchronous Delivery

Webhook requests are processed by background workers rather than blocking the main API.

---

### HMAC-SHA256 Signing

Every webhook request is cryptographically signed using a subscription-specific secret.

Example:

```http
X-HookFlow-Signature: sha256=<signature>
```

This allows consumers to verify that the request originated from HookFlow and was not modified in transit.

---

### Delivery IDs

Each delivery receives a unique identifier:

```http
X-Delivery-ID: del_xxxxxxxxx
```

Consumers can use this identifier to implement idempotent processing and detect duplicate deliveries.

---

### Automatic Retries

Failed deliveries are retried automatically using exponential backoff with jitter.

Conceptually:

```text
Attempt 1 → wait
Attempt 2 → longer wait
Attempt 3 → longer wait
Attempt 4 → longer wait
Attempt 5 → final attempt
```

---

### Request Timeouts

Customer endpoints are protected by strict request timeouts so that a slow external server cannot permanently occupy a worker.

---

### Dead-Letter Queue

Deliveries that continue failing after the maximum retry attempts are moved to a Dead-Letter Queue.

Administrators can inspect and replay these events.

---

### Circuit Breaker

Repeated failures from the same destination can temporarily pause delivery to that destination.

The circuit transitions through:

```text
CLOSED
   ↓
OPEN
   ↓
HALF-OPEN
   ↓
CLOSED
```

---

### Delivery Observability

The dashboard provides visibility into:

- total events
- successful deliveries
- failed deliveries
- retrying deliveries
- queue depth
- delivery latency
- HTTP status codes
- worker activity
- dead-lettered deliveries

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js |
| Language | TypeScript |
| API | Express |
| Queue | BullMQ |
| Message Broker | Redis |
| Database | PostgreSQL |
| ORM | Prisma |
| Frontend | React + TypeScript |
| Styling | Tailwind CSS |
| Testing | Jest + Supertest |
| Containers | Docker |
| CI/CD | GitHub Actions |
| Frontend Hosting | Vercel |
| Backend/Workers | Render |

---

## 🔄 Delivery Lifecycle

A webhook delivery follows this lifecycle:

```text
Event Created
      ↓
Event Persisted
      ↓
Delivery Created
      ↓
Queued
      ↓
Processing
      ↓
HTTP Request
      │
      ├── 2xx ─────────→ Delivered
      │
      ├── 4xx/5xx ─────→ Retry
      │
      └── Timeout ─────→ Retry
                              │
                              ▼
                       Maximum Attempts
                              │
                              ▼
                             DLQ
```

---

## 🔐 Security

HookFlow uses HMAC-SHA256 signatures to authenticate webhook requests.

The signature is generated using:

```text
HMAC-SHA256(
    subscription_secret,
    request_payload
)
```

The resulting signature is included in the request headers.

Consumers can independently calculate the signature and compare it with the received value.

---

## ♻️ Retry Strategy

Failed deliveries use exponential backoff with jitter.

Conceptually:

```text
delay = baseDelay × 2^attempt + randomJitter
```

This prevents large groups of failed requests from retrying simultaneously.

---

## 🗄️ Data Model

The system maintains records for:

### Subscriptions

Stores:

- destination URL
- subscribed event types
- webhook secret
- status
- timestamps

### Events

Stores:

- event ID
- event type
- payload
- creation timestamp

### Deliveries

Stores:

- delivery ID
- event ID
- subscription ID
- attempt count
- delivery status
- HTTP status
- response information
- latency
- next retry time

### Delivery Attempts

Stores the history of individual delivery attempts.

---

## 📊 Dashboard

HookFlow includes an interactive monitoring dashboard showing the state of the webhook delivery system.

The dashboard will provide:

```text
Events
Deliveries
Success Rate
Failures
Retries
Queue Depth
Worker Activity
Dead Letter Queue
```

It will also provide detailed delivery history and failure information.

---

## 🚀 Local Development

Clone the repository:

```bash
git clone <repository-url>
cd hookflow
```

Install dependencies:

```bash
npm install
```

Start infrastructure services:

```bash
docker compose up -d
```

Start the API:

```bash
npm run dev
```

Start the worker:

```bash
npm run worker
```

The exact commands will be updated as the project is implemented.

---

## 🐳 Docker

HookFlow will provide Docker support for local development and deployment.

The development environment will include:

```text
API
Worker
PostgreSQL
Redis
Frontend
```

---

## 🧪 Testing

The project will include automated tests for:

- subscription creation
- event ingestion
- HMAC signing
- webhook delivery
- request timeouts
- retry behavior
- exponential backoff
- idempotency
- dead-letter handling
- circuit breaker behavior

Run tests with:

```bash
npm test
```

---

## ☁️ Deployment

The production architecture will separate the frontend, API, workers, database, and Redis.

```text
Vercel
   │
   └── React Dashboard

Render
   │
   ├── API Service
   │
   └── Worker Service

Render PostgreSQL
   │
   └── Persistent application data

Redis
   │
   └── BullMQ queues
```

---

## 🌐 Live Demo

Coming soon.

Production dashboard:

```text
https://<vercel-domain>
```

API:

```text
https://<render-api-domain>
```

---

## 🧭 Project Roadmap

### Phase 1 — Foundation

- [ ] Project setup
- [ ] TypeScript configuration
- [ ] Express API
- [ ] Environment configuration
- [ ] Docker development environment

### Phase 2 — Subscriptions

- [ ] Subscription API
- [ ] PostgreSQL schema
- [ ] Secret generation
- [ ] Event filtering

### Phase 3 — Event Ingestion

- [ ] Event API
- [ ] Event persistence
- [ ] Delivery creation
- [ ] Redis/BullMQ integration

### Phase 4 — Delivery Workers

- [ ] Worker implementation
- [ ] HTTP delivery
- [ ] HMAC signing
- [ ] Timeout handling
- [ ] Delivery logging

### Phase 5 — Reliability

- [ ] Retry engine
- [ ] Exponential backoff
- [ ] Jitter
- [ ] Dead-letter queue
- [ ] Idempotency
- [ ] Circuit breaker

### Phase 6 — Dashboard

- [ ] React dashboard
- [ ] Queue monitoring
- [ ] Delivery history
- [ ] Retry visualization
- [ ] DLQ management

### Phase 7 — Production

- [ ] Automated tests
- [ ] Docker images
- [ ] GitHub Actions
- [ ] Vercel deployment
- [ ] Render deployment
- [ ] Production monitoring

---

## 🔮 Future Improvements

Possible future enhancements include:

- webhook replay
- API key authentication
- rate limiting
- per-customer concurrency limits
- destination health monitoring
- delivery analytics
- webhook payload encryption
- event replay
- horizontal worker scaling
- outbox pattern
- distributed tracing
- OpenTelemetry integration

---

## 🎯 Learning Goals

This project is designed to demonstrate practical understanding of:

- asynchronous processing
- message queues
- distributed systems
- worker pools
- fault tolerance
- retry strategies
- exponential backoff
- idempotency
- HMAC authentication
- circuit breakers
- database design
- observability
- Docker
- CI/CD
- production deployment

---

## 👨‍💻 Joshua

Built as a learning and portfolio project focused on backend engineering and distributed systems.
