# EduCore AI Integration Roadmap

## Goal
Map out the next AI-powered features that can be layered onto the existing EduCore ERP beyond the current AI Assistant.

## Current state
- Phase 8 foundation is live: a database-backed, multi-thread AI Assistant (`/api/chat`) with read-only analytical tools for students, staff, fees, attendance, admissions, and results.
- The system already has a multi-tenant architecture, role-based access, and a full academic/financial data model.
- Lovable AI Gateway is already configured and ready to support additional model types (chat, vision, embeddings, image generation, text-to-speech, speech-to-text).

## Recommended AI integrations

### 1. Academic Content Generator (highest value, lowest risk)
- Generate lesson plans, exam questions, and report-card comments for teachers.
- Generate certificate/letter content and official announcement drafts.
- Integration points: academics, certificates, classes, results, and a global "AI Writer" button.

### 2. Document Intelligence / OCR (high value for admissions & records)
- Extract text and key fields from scanned documents, report cards, certificates, and ID cards.
- Auto-fill inquiry/student fields from uploaded documents.
- Integration points: admissions upload, student documents, certificate verification.

### 3. Predictive Analytics & Risk Alerts (high value for leadership)
- At-risk student prediction based on attendance, fees, and marks.
- Enrollment and fee-collection forecasting.
- Automated insight summaries for the Insights dashboard.
- Integration points: insights, academics, fees, attendance.

### 4. Smart Communication Assistant (medium value, easy adoption)
- Draft parent emails, SMS, and circulars in multiple languages.
- Summarize student performance for parent-teacher meetings.
- Integration points: students, academics, portal, announcements.

### 5. Voice & Audio AI (medium value, optional)
- Text-to-speech for announcements or reading assignments.
- Speech-to-text for teacher notes or meeting minutes.
- Integration points: announcements, academics, staff portal.

### 6. Vision / Face Recognition (higher effort, optional)
- Photo verification for student/staff IDs.
- Optional face-recognition-based attendance.
- Integration points: attendance, staff, students.

## Proposed first step
Build **Academic Content Generator** as the next AI feature because it directly serves existing teacher/admin workflows and reuses the existing AI Gateway setup. It can be implemented as a set of server functions + side-panel/canvas components for generating and editing content before saving.

## Deliverables
- New AI tools for lesson-plan, exam-question, and comment generation.
- Reusable AI writing panel (`/ai-write` or slide-over component) across academic modules.
- Server functions wired to the existing Lovable AI Gateway helper.
- RLS-safe persistence so generated drafts are scoped to the user's tenant.

## Out of scope (for this next step)
- Real-time computer vision or biometric attendance.
- Predictive model training (can use rule-based scoring + AI summaries as a lighter first version).

## Next action
Pick the first AI integration to build (default: Academic Content Generator) and confirm which modules should receive AI buttons first.
