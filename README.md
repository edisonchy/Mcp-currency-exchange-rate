# Exchange Rate MCP Server

A Model Context Protocol (MCP) server that lets LLMs such as ChatGPT access live currency exchange rates.

https://github.com/user-attachments/assets/33b9ee21-c7a4-4947-a5b7-42e9ca1ab74f

## Project Aim

The aim of this project is to understand how to create and integrate custom MCP servers with LLMs such as ChatGPT.

## Problem Addressed

MCP offers a structured and reusable way for LLMs to interact with external APIs. This extends the capabilities of LLMs in two specific areas. Firstly, it gives LLMs the ability to perform actions rather than only answer questions. In addition, since language models are trained on historical data, MCP allows them to access time-sensitive data, such as current currency exchange rates.

## Future Applications

MCP is the current standard for enabling LLMs and AI agents to interact with backend API systems. This project has equipped me with the skills to create custom MCP servers for different backend systems, allowing AI tools to connect with and use custom APIs effectively.

## Features

- Supports single currency conversions (`convert_currency`) and batch conversions (`convert_currencies`).
- Provides an HTTP MCP endpoint served through a Node.js Express server.
- Runs in Docker with Cloudflare quick tunnel for public HTTPS access.

## Stack

- MCP TypeScript SDK
- Express
- Docker
- Cloudflare

## Prerequisites

Make sure Docker is installed and running on your system. Refer to the official Docker documentation for installation instructions:

https://docs.docker.com/

## Environment Setup

Create a local `.env` file:

```bash
cp .env.example .env
```

Get an ExchangeRate.dev API key:

https://exchangerate.dev/signup

Then set your API key:

```env
EXCHANGE_RATE_API_KEY=your_api_key_here
```

## Run With Docker

Start the MCP server and Cloudflare tunnel:

```bash
npm run docker
```

The local Docker endpoint is:

```text
http://127.0.0.1:65535/mcp
```

The Cloudflare tunnel prints a public HTTPS URL in the logs. Use that URL with `/mcp` at the end:

```text
https://your-tunnel.trycloudflare.com/mcp
```

## Connect to ChatGPT

When creating a custom connector in ChatGPT, use:

```text
Connection: Server URL
Server URL: https://your-tunnel.trycloudflare.com/mcp
Authentication: No authentication
```

## Scripts

```bash
npm start          # Run the MCP server locally
npm run docker     # Run the MCP server and Cloudflare tunnel with Docker
npm run typecheck  # Check TypeScript types
npm test           # Type-check and run unit tests
```

## Project Structure

```text
src/
  server.ts             # HTTP server
  index.ts              # MCP server
  conversion.ts         # MCP tools
  exchange-rate-api.ts  # ExchangeRate.dev client
  validation.ts         # Input validation

tests/
  exchange-rate-api.test.ts
  mcp-server.test.ts
```
