-- ============================================================
-- KP Database Initialization SQL
-- Run automatically on first PostgreSQL start (Docker init)
-- ============================================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- For text search

-- Create kp schema
CREATE SCHEMA IF NOT EXISTS kp;

-- Grant privileges
GRANT ALL PRIVILEGES ON SCHEMA kp TO kp_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA kp TO kp_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA kp TO kp_user;

-- Set default search path
ALTER DATABASE kp_db SET search_path TO public, kp;

SELECT 'KP database initialized' AS status;
