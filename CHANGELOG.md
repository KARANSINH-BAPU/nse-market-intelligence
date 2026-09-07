# Changelog

All notable changes to KP will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [0.1.0] — 2026-09-07

### Added
- Phase 0: Complete environment inspection (Windows 11, Python 3.14.7, Node 24.20.0)
- Phase 1: Repository structure with Git initialized
- Phase 1: .gitignore, .env templates, VERSION, AI_RULES.md
- Phase 1: Docker Compose for PostgreSQL/TimescaleDB + Redis
- Phase 1: FastAPI backend with /health, /health/live, /health/ready endpoints
- Phase 1: WebSocket connection manager foundation
- Phase 1: Structured JSON logging with correlation IDs
- Phase 1: Next.js 15 frontend with premium dark theme
- Phase 1: Sidebar navigation with all top-level KP routes
- Phase 1: System Status panel showing real service states
- Phase 1: Database migrations with Alembic (initial core schema)
- Phase 1: kp doctor, kp setup, kp start, kp stop CLI scripts
- Phase 1: Initial documentation: ARCHITECTURE, DATABASE, DATA_SOURCES
- Phase 1: Unit test foundation with pytest
- Phase 1: GitHub Actions CI configuration

### Architecture
- Backend: FastAPI + Python 3.14 + asyncio + SQLAlchemy 2.0
- Frontend: Next.js 15 + TypeScript + Tailwind-free vanilla CSS
- Database: PostgreSQL 17 + TimescaleDB extension
- Cache: Redis 7
- Package management: uv (Python), npm (Node.js)
- Containerization: Docker Compose (PostgreSQL + Redis)

### Known Limitations (Phase 1)
- No live market data yet (Phase 5)
- No ML models yet (Phase 10-12)
- No real predictions yet (Phase 13)
- Historical data pipeline not yet implemented (Phase 4)
- Docker Desktop not installed (WSL2 absent); using native PostgreSQL/Redis
