<p align="center">
	<img alt="NestJS" src="https://img.shields.io/badge/NestJS-Framework-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
	<img alt="SQLite" src="https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />
	<img alt="Testing" src="https://img.shields.io/badge/Testing-Jest-C21325?style=for-the-badge&logo=jest&logoColor=white" />
	<img alt="Architecture" src="https://img.shields.io/badge/Architecture-HCM%20Sync-blue?style=for-the-badge" />
	<img alt="Coverage" src="https://img.shields.io/badge/Coverage-High-success?style=for-the-badge" />
</p>

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Goals](#goals)
- [Tech Stack](#tech-stack)
- [Core Design Principles](#core-design-principles)
- [System Architecture](#system-architecture)
- [Architecture Diagrams](#architecture-diagrams)
- [Request Lifecycle](#request-lifecycle)
- [Data Model](#data-model)
- [API Overview](#api-overview)
- [Mock HCM Design](#mock-hcm-design)
- [Reconciliation Strategy](#reconciliation-strategy)
- [Project Structure](#project-structure)
- [Testing Strategy](#testing-strategy)
- [Getting Started](#getting-started)
- [Tradeoffs and Assumptions](#tradeoffs-and-assumptions)
- [Assessment Alignment](#assessment-alignment)
- [Future Improvements](#future-improvements)

---

## Overview

This service is designed to manage the lifecycle of employee time-off requests while maintaining balance consistency between the application and an external *Human Capital Management (HCM)* system, which remains the *source of truth*. The system supports balance reads, request submission, defensive validation, synchronization, and reconciliation of independently changing HCM balances. [Source](https://www.genspark.ai/api/files/s/vp2aatiE)

The core challenge is not just storing requests - it is preserving *balance integrity across two systems* where balances may change via realtime validation, batch refreshes, or external HCM-side adjustments such as anniversary bonuses or admin corrections. [Source](https://www.genspark.ai/api/files/s/vp2aatiE)

---

## Problem Statement

Employees interact with the time-off module as their primary interface, but the official record of employment and leave balance still lives in the HCM. This creates several engineering challenges:

- the user expects the displayed balance to be accurate
- the system must avoid approving invalid requests against stale balances
- HCM balances can change independently
- failures, retries, and drift must be handled defensively
- synchronization must work across both realtime and batch update paths [Source](https://www.genspark.ai/api/files/s/vp2aatiE)

---

## Goals

### Primary Goals

- Provide accurate time-off balance visibility
- Accept and manage time-off requests safely
- Preserve balance integrity with HCM
- Detect and correct balance drift
- Support mock HCM behavior for testing
- Demonstrate strong automated test coverage [Source](https://www.genspark.ai/api/files/s/vp2aatiE)

### Non-Goals

- Full payroll or HRIS platform behavior
- Frontend/UI implementation
- Enterprise-grade auth/SSO
- Complex accrual policy engines
- Production-grade distributed infrastructure

---

## Tech Stack

| Layer | Technology |
|------|------|
| Framework | NestJS |
| Language | TypeScript |
| Database | SQLite |
| ORM | Prisma or TypeORM |
| Testing | Jest + Supertest |
| API Style | REST |
| Documentation | Markdown + Mermaid |
| Mock External Dependency | Mock HCM module |

> The take-home specifically calls for *NestJS* and *SQLite*, plus mock HCM endpoints as part of the solution/testing approach. [Source](https://www.genspark.ai/api/files/s/vp2aatiE)

---

## Core Design Principles

### 1. HCM is the source of truth
The local service is operationally useful, but the final authority for leave balances remains the HCM. [Source](https://www.genspark.ai/api/files/s/vp2aatiE)

### 2. Defensive validation over blind trust
Even if HCM usually validates balance correctly, the service should still validate inputs and protect state transitions defensively. [Source](https://www.genspark.ai/api/files/s/vp2aatiE)

### 3. Hybrid synchronization model
Use *realtime validation* for request-critical flows and *batch reconciliation* for eventual consistency and drift correction. [Source](https://www.genspark.ai/api/files/s/vp2aatiE)

### 4. Auditability and explicit failure states
Every important sync attempt and request state transition should be visible, testable, and debuggable.

### 5. Tests are a first-class deliverable
Because this is an agentic-development exercise, the quality of the solution is strongly reflected in the rigor of test coverage and scenario depth. [Source](https://www.genspark.ai/api/files/s/vp2aatiE)

---

## System Architecture

At a high level, the system is composed of:

- *API Layer* for balances and time-off requests
- *Application/Domain Layer* for business rules and orchestration
- *Persistence Layer* for employees, balances, requests, and sync events
- *HCM Integration Layer* for realtime calls and reconciliation
- *Mock HCM Module* for simulation and testing
- *Test Suite* covering happy paths, failures, drift, retries, and reconciliation

---

## Architecture Diagrams

### 1) High-Level Component Diagram

```mermaid
flowchart LR
		A[Employee / Manager Client] --> B[Time-Off API]
		B --> C[Request Service]
		B --> D[Balance Service]
		C --> E[HCM Integration Service]
		D --> E
		C --> F[(SQLite Database)]
		D --> F
		E --> G[Mock HCM API / External HCM]
		H[Reconciliation Job] --> E
		H --> F
```

---

## Take-Home Question

### Product Context and User Needs

ReadyOn has a module that serves as the primary interface for employees to request time off. However, the Human Capital Management (HCM) system (for example, Workday or SAP) remains the source of truth for employment data.

The problem is that keeping balances in sync between two systems is difficult. If an employee has 10 days of leave and requests 2 days on ReadyOn, the service must ensure the HCM agrees that the balance is available, and it must also handle cases where the HCM balance changes independently (for example, a work anniversary bonus).

### User Personas

- The employee: Wants to see an accurate balance and get instant feedback on requests.
- The manager: Needs to approve requests knowing the data is valid.

### Task

Build a Time-Off Microservice that manages the lifecycle of a time-off request and maintains balance integrity.

### Interesting Challenges

- ReadyOn is not the only system that updates HCM. Balances may refresh at work anniversary or at the start of the year.
- HCM provides a realtime API for getting or sending time-off values (for example, 1 day for `locationId X` for `employeeId Y`).
- HCM provides a batch endpoint that sends the whole corpus of time-off balances (with required dimensions) to ReadyOn.
- HCM can return errors for invalid dimension combinations or insufficient balances, but this is not always guaranteed. The service should be defensive.
- The backend microservice should expose the necessary REST (or GraphQL) endpoints for handling balances and syncing with HCM.

### What Your Work Will Be Measured Against

- Engineering specification: A well-written Technical Requirement Document (TRD) with listed challenges, proposed solution, and alternatives considered.
- Test suite quality: Since this is agentic development, value is measured heavily by test rigor and regression protection.
- Deliverables:
- TRD
- Code in a GitHub repository
- Test cases and proof of coverage

### Guide Rails

- Go all in with agentic development. Do not hand-write code directly; be precise in the TRD and thorough in tests.
- Create mock HCM endpoints (or mock server behavior) with basic logic to simulate balance changes as part of testing.
- Develop with NestJS and SQLite.
- Assume balances are per-employee, per-location.

### Submission Requirements

- Upload only one `.zip` file.
- The `.zip` must include the complete project code and stay under 50 MB.
- Do not include `node_modules` or unnecessary folders.
- Include a `README.md` with clear setup and run instructions.
- Solution must be developed using JavaScript.
- You may use any library you consider appropriate.
- Security considerations and architectural decisions are part of the evaluation.

### Assessment Context

This exercise evaluates the design and implementation of a Time-Off Microservice, including technical requirements, solution structure, and testing strategy. It is intended to demonstrate technical execution, design quality, clarity, and engineering judgment.

Do not only paste requirements into AI and submit directly. Review the generated output carefully and improve the solution quality.

Please ensure submission completeness before upload. Late submissions may not be considered.
