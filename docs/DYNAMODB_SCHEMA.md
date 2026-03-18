# DynamoDB Schema Reference

This document describes active key patterns used by assessment/auth features.

## Assessment Table

Default table name:

- `oral_assessments` (configurable via `DYNAMODB_ASSESSMENT_TABLE`)

### Core Item Patterns

#### Assessment metadata

- `PK = ASSESSMENT#{assessmentId}`
- `SK = METADATA`

Attributes include: `title`, `course`, `description`, `dueDate`, `totalQuestions`, `timeLimit`, `status`, `createdBy`, timestamps.

#### Student enrollment per assessment

- `PK = ASSESSMENT#{assessmentId}`
- `SK = STUDENT#{studentId}`

Attributes include: `name`, `email`, `studentId`, `code`, `assignmentFile`, `status`, `enrolledAt`, optional submission timestamps.

#### Student assessment-scoped records

- `PK = STUDENT#{studentId}#ASSESSMENT#{assessmentId}`

Sort-key subtypes:

- `QUESTION#{questionId}`
- `ANSWER#{questionId}`
- `EVALUATION#{questionId}`
- `PROGRESS`
- `EVAL_PROGRESS` — per-student evaluation progress tracker (PK: `STUDENT#{id}#ASSESSMENT#{id}`, SK: `EVAL_PROGRESS`)
- `JOB#{jobId}` — batch job records created by `BatchJobManager` / `DynamoDBJobStore`

### Access Patterns

- Get assessment by id
- List assessments (via GSI)
- List students in assessment
- Get questions/answers/evaluations for student+assessment
- Read/write progress summary
- Read/write per-student evaluation progress (`EVAL_PROGRESS`)
- Read/write batch job state (`JOB#`)

## Auth Users Table (Optional)

Default table name:

- `auth_users` (configurable via `DYNAMODB_AUTH_USERS_TABLE`)

Used when persistent credential-backed auth users are enabled.

## Notes

- Keep key prefixes stable (`ASSESSMENT#`, `STUDENT#`, etc.) to avoid breaking query patterns.
- Any schema/key change must be paired with service updates and route tests.
# DynamoDB Schema Reference

This document describes active key patterns used by assessment/auth features.

## Assessment Table

Default table name:

- `oral_assessments` (configurable via `DYNAMODB_ASSESSMENT_TABLE`)

### Core Item Patterns

#### Assessment metadata

- `PK = ASSESSMENT#{assessmentId}`
- `SK = METADATA`

Attributes include: `title`, `course`, `description`, `dueDate`, `totalQuestions`, `timeLimit`, `status`, `createdBy`, timestamps.

#### Student enrollment per assessment

- `PK = ASSESSMENT#{assessmentId}`
- `SK = STUDENT#{studentId}`

Attributes include: `name`, `email`, `studentId`, `code`, `assignmentFile`, `status`, `enrolledAt`, optional submission timestamps.

#### Student assessment-scoped records

- `PK = STUDENT#{studentId}#ASSESSMENT#{assessmentId}`

Sort-key subtypes:

- `QUESTION#{questionId}`
- `ANSWER#{questionId}`
- `EVALUATION#{questionId}`
- `PROGRESS`

### Access Patterns

- Get assessment by id
- List assessments (via GSI)
- List students in assessment
- Get questions/answers/evaluations for student+assessment
- Read/write progress summary

## Auth Users Table (Optional)

Default table name:

- `auth_users` (configurable via `DYNAMODB_AUTH_USERS_TABLE`)

Used when persistent credential-backed auth users are enabled.

## Notes

- Keep key prefixes stable (`ASSESSMENT#`, `STUDENT#`, etc.) to avoid breaking query patterns.
- Any schema/key change must be paired with service updates and route tests.
"""
DynamoDB schema design for Oral Assessment System

Single table design with the following access patterns:
1. Get assessment by ID
2. List all assessments
3. Get students for assessment
4. Get questions for student + assessment
5. Get/update student progress
6. Submit/get answers
7. Get/update evaluation results

Table: oral_assessments
Primary Key: PK (partition key), SK (sort key)
GSI1: GSI1PK, GSI1SK (for queries by assessment, student, etc.)
"""

# Entity patterns:
# 
# Assessment:
#   PK: ASSESSMENT#{assessmentId}
#   SK: METADATA
#   GSI1PK: ASSESSMENT
#   GSI1SK: {createdAt}
#   Attributes: title, course, description, dueDate, totalQuestions, timeLimit, status, createdAt
#
# Student Enrollment:
#   PK: ASSESSMENT#{assessmentId}
#   SK: STUDENT#{studentId}
#   GSI1PK: STUDENT#{studentId}
#   GSI1SK: ASSESSMENT#{assessmentId}
#   Attributes: name, email, code, status, enrolledAt, startedAt, submittedAt
#
# Question:
#   PK: STUDENT#{studentId}#ASSESSMENT#{assessmentId}
#   SK: QUESTION#{questionId}
#   GSI1PK: ASSESSMENT#{assessmentId}
#   GSI1SK: STUDENT#{studentId}#QUESTION#{questionId}
#   Attributes: text, codeContext, difficulty, topic, createdAt
#   S3: questions/{studentId}/{assessmentId}/questions.json
#
# Answer:
#   PK: STUDENT#{studentId}#ASSESSMENT#{assessmentId}
#   SK: ANSWER#{questionId}
#   Attributes: audioUrl (S3), duration, submittedAt, transcript (optional)
#
# Evaluation:
#   PK: STUDENT#{studentId}#ASSESSMENT#{assessmentId}
#   SK: EVALUATION#{questionId}
#   Attributes: score, maxScore, feedback, strengths, improvements, evaluatedAt
#   S3: evaluations/{studentId}/{assessmentId}/results.json
#
# Progress Summary (computed):
#   PK: STUDENT#{studentId}#ASSESSMENT#{assessmentId}
#   SK: PROGRESS
#   Attributes: totalQuestions, answeredQuestions, percentage, status, lastUpdated

# Access Patterns:
# 1. Get assessment: Query PK=ASSESSMENT#{id}, SK=METADATA
# 2. List assessments: Query GSI1 where GSI1PK=ASSESSMENT
# 3. Get students for assessment: Query PK=ASSESSMENT#{id}, SK begins_with STUDENT#
# 4. Get questions for student: Query PK=STUDENT#{id}#ASSESSMENT#{aid}, SK begins_with QUESTION#
# 5. Get answers for student: Query PK=STUDENT#{id}#ASSESSMENT#{aid}, SK begins_with ANSWER#
# 6. Get evaluations: Query PK=STUDENT#{id}#ASSESSMENT#{aid}, SK begins_with EVALUATION#
# 7. Get progress: GetItem PK=STUDENT#{id}#ASSESSMENT#{aid}, SK=PROGRESS
