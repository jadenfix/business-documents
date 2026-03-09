# Business Documents

A Next.js application for managing business documents with AI-powered form filling, review workflows, and automated document generation.

## Features

- **Workflow Management**: Create and manage business document workflows.
- **AI Form Filling**: Uses Claude and Perplexity AI to automatically fill forms.
- **Review System**: Multi-stage review process with approval/rejection capabilities.
- **Document Generation**: Generates final documents from filled forms.
- **Real-time Updates**: Live updates via polling and WebSocket (simulated).
- **Data Persistence**: Uses Turso (SQLite) for database storage.
- **Background Processing**: Inngest for reliable background job processing.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Turso (SQLite)
- **AI**: Anthropic Claude, Perplexity AI
- **Background Jobs**: Inngest
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Variables**:
    Create a `.env` file in the root directory with the following variables:

    ```env
    ANTHROPIC_API_KEY=your_anthropic_key
    PERPLEXITY_API_KEY=your_perplexity_key
    TURSO_DATABASE_URL=your_turso_url
    TURSO_AUTH_TOKEN=your_turso_token
    BLOB_READ_WRITE_TOKEN=your_blob_token
    INNGEST_EVENT_KEY=your_inngest_event_key
    INNGEST_SIGNING_KEY=your_inngest_signing_key
    NEXT_PUBLIC_APP_URL=http://localhost:3000
    ```

3.  **Database Setup**:
    Run the database migration script:
    ```bash
    npx tsx src/lib/db/migrate.ts
    ```

## Development

- **Start Development Server**:
    ```bash
    npm run dev
    ```

- **Run Tests**:
    ```bash
    npm test
    ```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
├── components/             # React components
├── contracts/              # TypeScript type definitions
├── lib/                    # Core logic
│   ├── api-utils.ts        # API response helpers
│   ├── db/                 # Database operations
│   ├── inngest/            # Inngest client and functions
│   ├── workflows/          # Workflow execution logic
│   └── utils.ts            # Utility functions
├── styles/                 # Global styles
└── types/                  # Global TypeScript types
```

## API Endpoints

### Workflows
- `GET /api/workflows` - List all workflows
- `POST /api/workflows` - Create a new workflow
- `GET /api/workflows/:id` - Get workflow details
- `PUT /api/workflows/:id` - Update workflow
- `DELETE /api/workflows/:id` - Delete workflow

### Forms
- `GET /api/workflows/:id/forms` - Get forms for a workflow
- `POST /api/workflows/:id/forms` - Add a form to a workflow
- `PUT /api/workflows/:id/forms/:formId` - Update a form
- `DELETE /api/workflows/:id/forms/:formId` - Delete a form

### Form Fills
- `POST /api/workflows/:id/forms/fill/start` - Start AI form filling
- `GET /api/workflows/:id/forms/fill/status` - Check fill status
- `GET /api/workflows/:id/forms/fill/results` - Get fill results

### Review
- `POST /api/workflows/:id/review/approve` - Approve workflow review
- `POST /api/workflows/:id/review/reject` - Reject workflow review

## License

ISC
