# Haashir — Design Document

> AI-powered dispatch assistant for emergency call prioritization and incident consolidation.

---

## 1. Overview

Haashir is a web-based tool that augments 911 operators by:
- Prioritizing incoming calls  
- Consolidating repeated reports into unified incidents  
- Reducing manual documentation burden  

The system is designed to **assist, not replace** human operators, allowing them to focus on critical decision-making and caller support.

---

## 2. Problem Statement

Emergency call centers (PSAPs) face three major challenges:

### Operator Shortage
- High call volumes → not all calls answered immediately  
- Life-threatening calls risk being delayed  

### Poor Prioritization
- Non-emergency calls (e.g., noise complaints) compete with critical ones  
- Current systems rely on manual triage  

### Repetitive / Fragmented Information
- Multiple callers report the same incident  
- Operators must manually piece together information  
- Responders lack a holistic, real-time view  

---

## 3. Solution

Haashir introduces a real-time AI layer that:
- Screens and prioritizes incoming calls  
- Clusters related calls into incidents  
- Generates a live **Situation Sheet** per incident  
- Continuously updates information and flags conflicts  

---

## 4. Buildathon MVP Scope

To ensure a focused and deliverable system, Haashir’s buildathon implementation will include:

### In Scope
- AI call prioritization (text-based)
- Incident clustering using semantic + location similarity
- Situation Sheet UI with:
  - aggregated details
  - caller count
  - contradiction detection
- Real-time updates from simulated incoming calls

### Out of Scope
- Real telephony / audio ingestion
- Full CAD/RMS integration
- Live GPS routing
- Production-grade scalability

### Demo Scenario

We simulate 20 incoming calls across 3 distinct incidents:
- 1 high-priority medical emergency
- 1 medium-priority car accident
- 1 low-priority noise complaint

During the demo:
1. Calls are ingested in real time
2. Haashir clusters them into incidents
3. A Situation Sheet is dynamically generated
4. Conflicting information is surfaced
5. A high-priority call interrupts the queue and triggers an alert

This demonstrates prioritization, clustering, and real-time incident intelligence.

---

## 5. Core Features

### AI Call Prioritization
Analyze incoming call transcript (or audio → text) to classify urgency:

- 🔴 High (life-threatening)  
- 🟡 Medium  
- 🟢 Low

**Output:**
- Urgency score  
- Reasoning (e.g., “not breathing”)  

**Use Case:**
- Alerts operator if a high-priority call arrives while they are occupied  

---

### Incident Clustering
Detect when multiple calls refer to the same event using:
- Location similarity  
- Time proximity  
- Semantic similarity  
- Operator input  

**Example:**
- “Car crash on Main Street”  
- “Accident near Starbucks on Main”  

→ Grouped into a single incident  

---

### Situation Sheet (Core UI)

A live, unified summary of a single incident.

**Includes:**
- 📍 Location  
- 🚨 Incident type  
- 🧾 Aggregated details  
- ⚠️ Contradictions  
- 📈 Confidence levels  
- 📞 Number of callers  

**Example:**
```
Incident: Car Crash
Location: Main St & 5th
Callers: 12

Details:
	•	2 vehicles involved
	•	1 person unconscious
	•	Possible fire

Conflicts:
	•	Caller 3: “no injuries”
	•	Caller 7: “multiple injured”
```

---

### Live Updates
- New calls automatically update the situation sheet  
- Information is:
  - Merged  
  - Deduplicated  
  - Conflict-checked  
- Conflicting information is explicitly flagged  

---

### AI Call Screening Mode
When operators are overwhelmed:
- AI screens unanswered calls  
- Flags high-priority calls immediately  

**Important:**
- Does **not** replace answering calls  
- Acts only as a **triage safety net**

---

### Dispatcher Assist
- Auto-generates structured reports for CAD systems  
- Suggests responders (EMS, fire, police)  

---

## 6. System Flow

### Step 1: Call Intake
- Call transcript enters the system  
- In shortage mode, AI pre-screens calls  

### Step 2: AI Processing
- Classifies urgency  
- Extracts structured information  

### Step 3: Incident Matching
- Matches to an existing incident  
- Or creates a new one  

### Step 4: Situation Sheet Update
- Merges new information  
- Updates confidence and contradictions  

### Step 5: Operator Interface
Operators see:
- Prioritized call queue  
- Situation sheets  
- Alerts  

---

## 7. Technical Architecture

### Frontend
- React
- Displays:
	- Prioritized call queue
	- Situation sheet panel
	- Live updates via WebSocket

### Backend
- Python (FastAPI)
- Google Generative AI SDK for Gemini integration
- Handles:
	- call ingestion
	- AI processing
	- clustering logic
	- incident state management

### AI Components

#### 1. Call Priorization
- Model: Gemini 1.5 Flash (Google)
- Task: classify urgency (HIGH / MEDIUM / LOW)
- Output: structured JSON via function calling 

#### 2. Information Extraction
- Model: Gemini 1.5 Flash
- Extract:
  - location
  - incident type
  - key details
- Stored as structured fields

#### 3. Semantic Clustering
- Model: text-embedding-004 (Google embeddings)
- Method:
  - cosine similarity between call embeddings
  - threshold-based clustering
- Combined with:
  - time window (e.g., last 10 minutes)
  - location proximity


### Data Model

#### Call Object
```json
{
  "call_id": "string",
  "timestamp": "datetime",
  "location": "string",
  "transcript": "string",
  "priority": "HIGH | MEDIUM | LOW",
  "embedding": "vector"
}
```
#### Incident Object
```json
{
  "incident_id": "string",
  "calls": ["call_id"],
  "location": "string",
  "incident_type": "string",
  "aggregated_details": ["string"],
  "conflict_log": ["string"],
  "confidence_score": "float"
}
```

---

## 8. Scalability

To handle high call volume scenarios:

### Architecture
- Redis: real-time incident state + caching
- PostgreSQL: persistent storage
- Stateless backend services for horizontal scaling

### High Volume Handling
- Batch embedding generation
- Queue-based ingestion (e.g., Kafka or Redis queue)
- Rate-limited AI inference

### Incident Store
- Event-based updates:
  - each call = event
  - incidents updated incrementally

This ensures the system remains responsive under burst traffic.
 
---

## 9. Competitive Landscape

Existing systems include:
- RapidSOS: provides location and data integration
- Axon Dispatch: modern CAD interface and reporting
- Tyler Technologies (New World CAD): widely used dispatch system

### Limitation of Existing Systems
- Focus on data display, not AI reasoning
- No real-time multi-call aggregation
- No conflict detection across callers

### Haashir Differentiation

Unlike existing CAD systems, Haashir:
- Aggregates multiple calls into a single evolving incident
- Detects and surfaces contradictions between callers
- Uses AI to prioritize and structure information in real time

This enables a more complete and accurate situational awareness.

---

## 10. Key Innovations

- Multi-call aggregation into a single incident  
- Conflict-aware summarization  
- AI triage under resource constraints  
- Real-time evolving incident intelligence  

---

## 11. User Impact

Haashir improves operator efficiency and emergency response quality by reducing workload and surfacing critical information faster.

### Key Impacts

-  **Reduced Documentation Time**  
  Auto-generates structured incident summaries, cutting report time from minutes to seconds  

- **Improved Prioritization**  
  Identifies and surfaces life-threatening calls immediately  

- **Better Situational Awareness**  
  Merges duplicate calls into a single, real-time incident view  

- **Lower Cognitive Load**  
  Eliminates repetitive data entry, allowing operators to focus on caller interaction  

- **Faster Decision-Making**  
  Highlights key details and contradictions in real time  

---

Haashir augments human operators, ensuring attention is focused on the most critical emergencies.

---

## 12. Constraints & Ethics

- Must not replace human operators  
- Must minimize false negatives for critical calls  
- Must clearly communicate uncertainty  

---

## 13. Risk Assessment

### Risk: False negatives in prioritization
- Mitigation:
  - conservative classification thresholds
  - fallback to human review

### Risk: Incorrect clustering
- Mitigation:
  - allow manual split/merge of incidents

### Risk: AI hallucination
- Mitigation:
  - restrict outputs to structured extraction
  - avoid free-form generation

### Risk: Latency
- Mitigation:
  - async processing
  - caching embeddings

### Risk: Lack of real data
- Mitigation:
  - use realistic simulated transcripts

---

## 14. Execution Plan

### Team Roles
- Frontend: UI + real-time updates
- Backend: API + data model
- AI: prioritization + clustering

### Timeline

**12:00 – 1:00 (Setup)**
- Initialize repo + project structure  
- Define data models (`Call`, `Incident`)  
- Set up backend (FastAPI / Express)  
- Create mock call data  

**1:00 – 2:00 (Prioritization)**
- Implement call ingestion (`POST /calls/ingest`)  
- Add AI-based urgency classification  
- Output structured data (priority, key details)  

**2:00 – 3:00 (Clustering)**
- Generate embeddings for calls  
- Implement similarity-based clustering  
- Create/update `Incident` objects  

**3:00 – 4:00 (Situation Sheet)**
- Aggregate incident data  
- Add conflict detection  
- Build incident endpoint  

**4:00 – 5:00 (Frontend)**
- Build call queue (left panel)  
- Build situation sheet (right panel)  
- Display priority + grouped incidents  

**5:00 – 6:00 (Polish)**
- Add live updates (polling/WebSocket)  
- Simulate incoming calls  
- UI polish + demo testing  

---

## 15. Future Extensions

- Voice integration  
- Real GPS + dispatch routing  
- Predictive incident escalation  
- Integration with RMS/CAD systems (e.g., Axon)  

---