// ─── Types ───────────────────────────────────────────────────────────────────

export type Priority = "HIGH" | "MEDIUM" | "LOW";

export interface Call {
  id: string;
  timestamp: string;
  location: string;
  transcript: string;
  priority: Priority;
  urgencyScore: number;
  aiReasoning: string;
  keywords: string[];
  elapsed: string;
  callerId?: string;
}

export interface Incident {
  id: string;
  title: string;
  type: string;
  location: string;
  coordinates: { lat: number; lng: number };
  priority: Priority;
  description: string;
  callerCount: number;
  elapsedTime: string;
  casualties: number;
  riskIndex: string;
  unitsAssigned: string[];
  icon: string;
  confidenceScore: number;
  aiReport: string;
  aggregatedDetails: { label: string; value: string; icon: string; color?: string }[];
  conflicts: { field: string; callerA: { id: string; statement: string }; callerB: { id: string; statement: string } }[];
  confidenceLevels: { label: string; value: number; color: string }[];
  transcript: { time: string; speaker: string; text: string; isAI?: boolean; isLive?: boolean }[];
}

export interface TrendPattern {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "analyzing";
  escalationLikelihood: number;
  timeAgo?: string;
  icon: string;
  location: string;
  coordinates: { lat: number; lng: number };
  summary: string;
  callTimeline: { time: string; callerId: string; text: string }[];
  callLocations: { lat: number; lng: number; label: string }[];
}

export interface AITriageCall {
  id: string;
  triageDuration: string;
  priority: number;
  transcript: string;
  recommendation: string;
  action: string;
  accentColor: "primary" | "tertiary" | "error";
}

// ─── Mock Calls (Call Queue) ─────────────────────────────────────────────────

export const mockCalls: Call[] = [
  {
    id: "911-X8429-ALPHA",
    timestamp: "2024-11-24T14:32:05Z",
    location: "2245 Oak Ridge Dr, Sector 4",
    transcript: "There are gunshots! Someone is screaming, please send help immediately!",
    priority: "HIGH",
    urgencyScore: 9.8,
    aiReasoning: "Keywords: gunshot, screaming, medical-distress. High voice stress detected in caller.",
    keywords: ["gunshot", "screaming", "medical-distress"],
    elapsed: "00:14",
  },
  {
    id: "911-Y1102-BETA",
    timestamp: "2024-11-24T14:33:12Z",
    location: "I-95 Southbound, Mile 142",
    transcript: "There's a car accident on the highway. Debris everywhere and I see smoke coming from one vehicle.",
    priority: "MEDIUM",
    urgencyScore: 6.2,
    aiReasoning: "Keywords: fender-bender, debris, smoke. Low imminent life threat. Traffic hazard primary.",
    keywords: ["fender-bender", "debris", "smoke"],
    elapsed: "01:02",
  },
  {
    id: "911-A5590-ZETA",
    timestamp: "2024-11-24T14:34:45Z",
    location: "440 Main St, Apt 4B",
    transcript: "My neighbors are having a really loud party and it's after midnight. The music is shaking my walls.",
    priority: "LOW",
    urgencyScore: 2.4,
    aiReasoning: "Keywords: noise, party, neighbors. Nuisance call parameters met.",
    keywords: ["noise", "party", "neighbors"],
    elapsed: "03:45",
  },
  {
    id: "911-B7723-DELTA",
    timestamp: "2024-11-24T14:35:20Z",
    location: "1820 Commerce Blvd",
    transcript: "Someone just stole my car from the parking lot. I can still see them driving away!",
    priority: "MEDIUM",
    urgencyScore: 5.8,
    aiReasoning: "Keywords: theft, vehicle, in-progress. Property crime with suspect on-scene.",
    keywords: ["theft", "vehicle", "in-progress"],
    elapsed: "02:30",
  },
  {
    id: "911-C3314-ECHO",
    timestamp: "2024-11-24T14:36:00Z",
    location: "Riverside Park, East Entrance",
    transcript: "There's an elderly man who collapsed on the trail. He's not responding to me.",
    priority: "HIGH",
    urgencyScore: 8.9,
    aiReasoning: "Keywords: collapse, unresponsive, elderly. Potential cardiac event. Immediate medical dispatch required.",
    keywords: ["collapse", "unresponsive", "elderly"],
    elapsed: "00:45",
  },
];

// ─── Mock Incidents ──────────────────────────────────────────────────────────

export const mockIncidents: Incident[] = [
  {
    id: "STNL-9924-A",
    title: "Structure Fire — Industrial Sector C",
    type: "Structure Fire / HAZMAT",
    location: "Petro-Chem Processing Plant, 1200 Industrial Ave",
    coordinates: { lat: 40.7128, lng: -74.0060 },
    priority: "HIGH",
    description: "Multiple callers reporting heavy smoke and visible flames at Petro-Chem Processing Plant. Potential HAZMAT involvement on-site.",
    callerCount: 14,
    elapsedTime: "12:44",
    casualties: 2,
    riskIndex: "A+",
    unitsAssigned: ["FD-04", "FD-12", "HAZMAT-1"],
    icon: "local_fire_department",
    confidenceScore: 88,
    aiReport: "**Incident Summary:** Structure fire at Petro-Chem Processing Plant with confirmed HAZMAT involvement. 14 callers have reported the incident over a 12-minute window.\n\n**Key Facts:**\n- Heavy black smoke visible from 3 distinct vantage points, confirmed by cross-referencing caller locations\n- 2 confirmed casualties reported by on-scene witnesses (CALLER-003, CALLER-007)\n- Chemical storage tanks in proximity — HAZMAT protocol activated\n- Fire originated in east wing processing area based on 8/14 caller triangulation\n\n**Conflicting Reports:**\n- Injury count varies between callers (range: 0–5). AI confidence on \"2 casualties\" is 74%.\n- One caller (CALLER-012) reports explosion; no corroborating evidence from other callers or sensors\n\n**AI Recommendation:**\nMaintain 3-unit response (FD-04, FD-12, HAZMAT-1). Consider upgrading to 4-alarm given HAZMAT proximity and wind direction (NNW at 12mph) pushing smoke toward residential Zone B. EMS staging recommended at 1400 Industrial Ave.",
    aggregatedDetails: [
      { label: "Smoke Plumes Reported", value: "3", icon: "cloud" },
      { label: "Confirmed Casualties", value: "2", icon: "personal_injury", color: "error" },
      { label: "HAZMAT Proximity", value: "Critical", icon: "local_fire_department", color: "tertiary" },
    ],
    conflicts: [
      {
        field: "Casualty Count",
        callerA: { id: "CALLER 3", statement: '"I can see two people being carried out by workers"' },
        callerB: { id: "CALLER 12", statement: '"There must be at least five people still inside!"' },
      },
    ],
    confidenceLevels: [
      { label: "Location Accuracy", value: 98, color: "primary" },
      { label: "Injury Triage", value: 74, color: "secondary" },
      { label: "HAZMAT Involvement", value: 92, color: "primary" },
    ],
    transcript: [
      { time: "14:31:20", speaker: "CALLER-001", text: "I can see massive black smoke coming from the Petro-Chem plant. It looks like the east side of the building." },
      { time: "14:31:45", speaker: "SYSTEM (AI)", text: "Extracted: [Petro-Chem Plant], [East Wing], [Heavy Smoke], [Industrial Ave]", isAI: true },
      { time: "14:32:10", speaker: "CALLER-003", text: "Oh god, they're carrying people out. I can see at least two people on stretchers. The fire is spreading!" },
      { time: "14:32:55", speaker: "SYSTEM (AI)", text: "Cross-ref: 3 callers confirm east wing origin. HAZMAT inventory check initiated.", isAI: true },
      { time: "14:33:30", speaker: "CALLER-007", text: "I work at the adjacent facility. There are chemical storage tanks about 200 feet from the fire. You need to get people out of here!" },
      { time: "14:34:05", speaker: "DISPATCHER", text: "Sir, are the tanks visibly damaged or leaking?" },
      { time: "14:34:20", speaker: "CALLER-007", text: "Not yet, but the fire is moving in that direction. The wind is blowing the smoke toward the residential area." },
      { time: "14:35:00", speaker: "CALLER-012", text: "I heard an explosion! There was a loud boom about a minute ago!", isLive: false },
      { time: "14:35:15", speaker: "SYSTEM (AI)", text: "⚠️ Explosion claim: No corroborating reports from 13 other callers. Flagged as UNVERIFIED.", isAI: true },
      { time: "14:36:00", speaker: "CALLER-014", text: "The smoke is getting really thick over here on Elm Street. It smells like chemicals...", isLive: true },
    ],
  },
  {
    id: "STNL-8842-X",
    title: "Pile-up on Main St",
    type: "Multi-Vehicle Collision",
    location: "Main St & 5th Ave, Downtown",
    coordinates: { lat: 40.7580, lng: -73.9855 },
    priority: "HIGH",
    description: '4-vehicle collision near junction. Blockage across all northbound lanes. AI: "Significant debris, high-speed impact detected via traffic cams."',
    callerCount: 12,
    elapsedTime: "04:12",
    casualties: 1,
    riskIndex: "B+",
    unitsAssigned: ["PD-07", "EMS-09", "FD-02"],
    icon: "minor_crash",
    confidenceScore: 94,
    aiReport: "**Incident Summary:** Multi-vehicle collision at Main St & 5th Ave intersection involving 4 vehicles. 12 callers over a 4-minute window.\n\n**Key Facts:**\n- 4 vehicles involved: white SUV, blue sedan, delivery truck, black hatchback\n- 1 person unresponsive in blue sedan (confirmed by CALLER-001, CALLER-005)\n- Smoke observed from blue sedan engine compartment — fire risk elevated\n- All northbound lanes blocked; traffic backing up 0.8 miles\n\n**Conflicting Reports:**\n- CALLER-003 reports no injuries (cosmetic only); CALLER-007 reports multiple trapped persons. AI weighted toward CALLER-007 based on proximity and detail level.\n\n**AI Recommendation:**\nMaintain 3-unit response. Fire unit FD-02 should prioritize vehicle fire prevention. EMS-09 focus on blue sedan occupant extraction. PD-07 establish traffic diversion at 4th Ave.",
    aggregatedDetails: [
      { label: "Vehicles Involved", value: "4", icon: "directions_car" },
      { label: "Unconscious Persons", value: "1", icon: "personal_injury", color: "error" },
      { label: "Possible Fire Risk", value: "High Risk", icon: "local_fire_department", color: "tertiary" },
    ],
    conflicts: [
      {
        field: "Injury Severity",
        callerA: { id: "CALLER 3", statement: '"No one seems to be injured, just cosmetic damage..."' },
        callerB: { id: "CALLER 7", statement: '"There are multiple injured people trapped in the blue sedan!"' },
      },
    ],
    confidenceLevels: [
      { label: "Location Accuracy", value: 98, color: "primary" },
      { label: "Injury Triage", value: 62, color: "secondary" },
      { label: "Vehicle Identification", value: 85, color: "primary" },
    ],
    transcript: [
      { time: "14:28:00", speaker: "CALLER-001", text: "Oh my god, I just saw it happen! Two cars just smashed into each other right in the middle of the intersection!" },
      { time: "14:28:15", speaker: "SYSTEM (AI)", text: "Extracted: [2+ Vehicles], [Main & 5th], [Visual Confirmed]", isAI: true },
      { time: "14:28:45", speaker: "CALLER-003", text: "I'm across the street. Looks like a fender bender, nobody seems hurt." },
      { time: "14:29:10", speaker: "CALLER-005", text: "The driver of the white SUV is out, but the person in the blue car isn't moving. I think they're trapped. Wait, I see smoke!" },
      { time: "14:29:30", speaker: "DISPATCHER", text: "Ma'am, stay back from the vehicles. Is the smoke coming from the engine or the cabin?" },
      { time: "14:29:50", speaker: "CALLER-005", text: "It's coming from under the hood... it's getting thicker..." },
      { time: "14:30:20", speaker: "CALLER-007", text: "There are definitely people hurt! The blue sedan is crushed on the driver's side. Someone needs to get them out!", isLive: false },
      { time: "14:30:45", speaker: "SYSTEM (AI)", text: "⚠️ Conflict: CALLER-003 reports no injuries vs CALLER-007 reports trapped persons. Weighting CALLER-007 (closer proximity, higher detail).", isAI: true },
      { time: "14:31:15", speaker: "CALLER-010", text: "A delivery truck just rear-ended another car trying to stop. It's now a 4-car pileup.", isLive: true },
    ],
  },
  {
    id: "STNL-7721-B",
    title: "Cardiac Arrest — Riverside Park",
    type: "Medical Emergency",
    location: "Riverside Park, East Entrance Trail",
    coordinates: { lat: 40.8010, lng: -73.9712 },
    priority: "MEDIUM",
    description: 'Elderly male unconscious on trail. Bystander CPR in progress. AI: "Dispatcher providing tele-instruction, EMS eta 4 mins."',
    callerCount: 3,
    elapsedTime: "06:30",
    casualties: 0,
    riskIndex: "C",
    unitsAssigned: ["EMS-12"],
    icon: "medical_services",
    confidenceScore: 91,
    aiReport: "**Incident Summary:** Elderly male (est. 65-75) found unresponsive on Riverside Park trail. 3 callers over 6-minute window.\n\n**Key Facts:**\n- Patient collapsed while walking; bystander initiated CPR at scene\n- No visible trauma — suspected cardiac event\n- Bystander reports patient was clutching chest before collapse\n- AED located 200m from scene (park maintenance building)\n\n**AI Recommendation:**\nEMS-12 en route, ETA 4 minutes. Continue dispatcher-guided CPR tele-instruction. Direct bystander to nearest AED if second helper available.",
    aggregatedDetails: [
      { label: "Patient Age", value: "~70", icon: "elderly" },
      { label: "CPR Status", value: "Active", icon: "medical_services", color: "tertiary" },
      { label: "AED Nearby", value: "200m", icon: "location_on" },
    ],
    conflicts: [],
    confidenceLevels: [
      { label: "Location Accuracy", value: 95, color: "primary" },
      { label: "Medical Assessment", value: 78, color: "primary" },
    ],
    transcript: [
      { time: "14:30:00", speaker: "CALLER-001", text: "There's an elderly man who collapsed on the trail. He's not responding to me. I think he had a heart attack." },
      { time: "14:30:20", speaker: "SYSTEM (AI)", text: "Extracted: [Elderly Male], [Unresponsive], [Riverside Park East Trail], [Suspected Cardiac]", isAI: true },
      { time: "14:30:45", speaker: "DISPATCHER", text: "Is he breathing? Can you check for a pulse?" },
      { time: "14:31:00", speaker: "CALLER-001", text: "I don't think so... I know CPR, should I start?" },
      { time: "14:31:10", speaker: "DISPATCHER", text: "Yes, begin chest compressions. Push hard and fast in the center of his chest. I'll guide you." },
      { time: "14:32:00", speaker: "CALLER-002", text: "I'm also here at the park. The man was holding his chest before he fell. Another person is doing CPR.", isLive: true },
    ],
  },
];

// ─── Mock Trend Patterns ─────────────────────────────────────────────────────

export const mockTrends: TrendPattern[] = [
  {
    id: "ESC-9902",
    title: "Multi-Point Gas Leak Suspect",
    description: '4 separate "chemical smell" calls synchronized within 150m radius. Threshold breached.',
    severity: "critical",
    escalationLikelihood: 84,
    icon: "error",
    location: "North Riverside, Sector 4",
    coordinates: { lat: 40.8050, lng: -73.9680 },
    summary: "AI detected a spatial cluster of 4 independent \"chemical smell\" reports within a 150-meter radius over a 22-minute window. All callers describe similar sulfur/rotten-egg odor. Cross-referenced with utility records — a gas main runs directly through the cluster center. No scheduled maintenance. Pattern is consistent with underground gas leak profile. Escalation likelihood: 84%.",
    callTimeline: [
      { time: "9:03 AM", callerId: "CALLER-201", text: "There's a strong gas smell outside my apartment on River Rd." },
      { time: "9:14 AM", callerId: "CALLER-204", text: "Smells like rotten eggs near the corner of River & Oak." },
      { time: "9:19 AM", callerId: "CALLER-208", text: "Chemical smell getting worse, my kids are complaining of headaches." },
      { time: "9:25 AM", callerId: "CALLER-211", text: "I can smell gas all the way from the parking lot on Cedar St." },
    ],
    callLocations: [
      { lat: 40.8048, lng: -73.9675, label: "CALLER-201: River Rd" },
      { lat: 40.8052, lng: -73.9682, label: "CALLER-204: River & Oak" },
      { lat: 40.8055, lng: -73.9678, label: "CALLER-208: Oak St" },
      { lat: 40.8045, lng: -73.9690, label: "CALLER-211: Cedar St" },
    ],
  },
  {
    id: "ESC-8411",
    title: "Sequential Power Grid Fluctuations",
    description: "Power outage reports cascading across Sector 4 in 14-minute window.",
    severity: "warning",
    escalationLikelihood: 68,
    timeAgo: "14m ago",
    icon: "device_thermostat",
    location: "Sector 4, Downtown Grid",
    coordinates: { lat: 40.7505, lng: -73.9934 },
    summary: "Sequential power failure reports moving east-to-west across Sector 4 downtown grid. 6 calls in 14 minutes describing flickering lights escalating to full blackouts. Pattern suggests cascading transformer failures. Utility company notified but not yet responding. AI monitoring for correlation with traffic signal outages.",
    callTimeline: [
      { time: "12:03 PM", callerId: "CALLER-301", text: "Lights flickering in our office building on 8th Ave." },
      { time: "12:07 PM", callerId: "CALLER-305", text: "Power just went out completely on 7th Ave." },
      { time: "12:11 PM", callerId: "CALLER-308", text: "Whole block is dark on 6th Ave. Traffic lights are out too." },
      { time: "12:14 PM", callerId: "CALLER-312", text: "No power on 5th Ave now. People stuck in elevators." },
      { time: "12:16 PM", callerId: "CALLER-315", text: "Power surge fried equipment in our restaurant on 4th." },
      { time: "12:17 PM", callerId: "CALLER-318", text: "Sparks coming from a transformer on Broadway & 42nd." },
    ],
    callLocations: [
      { lat: 40.7510, lng: -73.9905, label: "CALLER-301: 8th Ave" },
      { lat: 40.7508, lng: -73.9920, label: "CALLER-305: 7th Ave" },
      { lat: 40.7505, lng: -73.9938, label: "CALLER-308: 6th Ave" },
      { lat: 40.7503, lng: -73.9950, label: "CALLER-312: 5th Ave" },
      { lat: 40.7500, lng: -73.9965, label: "CALLER-315: 4th Ave" },
      { lat: 40.7555, lng: -73.9870, label: "CALLER-318: Broadway & 42nd" },
    ],
  },
  {
    id: "ESC-7720",
    title: "Micro-Smoke Signature Clusters",
    description: "Low-confidence smoke reports aggregating in downtown corridor.",
    severity: "analyzing",
    escalationLikelihood: 65,
    icon: "air",
    location: "Downtown Corridor, Sector B",
    coordinates: { lat: 40.7210, lng: -74.0050 },
    summary: "3 low-priority calls mentioning \"haze\" or \"light smoke\" in the downtown corridor over the past hour. Individually classified as LOW priority, but AI spatial clustering suggests possible emerging fire or HVAC system failure in a large commercial building. AQI sensors show marginal PM2.5 increase (+8%) in the area. Monitoring for additional reports.",
    callTimeline: [
      { time: "11:30 AM", callerId: "CALLER-401", text: "There's a light haze inside the mall food court." },
      { time: "11:52 AM", callerId: "CALLER-405", text: "Smoky smell in the office building lobby on Church St." },
      { time: "12:15 PM", callerId: "CALLER-409", text: "Visibility seems reduced on Vesey St, like a thin fog but it smells." },
    ],
    callLocations: [
      { lat: 40.7215, lng: -74.0045, label: "CALLER-401: Mall Food Court" },
      { lat: 40.7205, lng: -74.0055, label: "CALLER-405: Church St" },
      { lat: 40.7210, lng: -74.0060, label: "CALLER-409: Vesey St" },
    ],
  },
];

// ─── Mock AI Triage Calls (Haashir Assist) ──────────────────────────────────

export const mockTriageCalls: AITriageCall[] = [
  {
    id: "4492-X",
    triageDuration: "00:42s",
    priority: 4,
    transcript: '"Caller reporting a non-injury vehicle accident in a parking lot. Requesting information on exchange of documents..."',
    recommendation: "Unit Dispatched via AI",
    action: "Override",
    accentColor: "primary",
  },
  {
    id: "4493-Z",
    triageDuration: "00:12s",
    priority: 2,
    transcript: '"Suspected break-in in progress at commercial warehouse. Audio indicates glass breakage and multiple voices..."',
    recommendation: "Escalate to Sector B",
    action: "Pick Up",
    accentColor: "tertiary",
  },
];

// ─── Source Timeline (Incident Intelligence) ─────────────────────────────────

export const mockSourceTimeline = [
  { time: "14:32:05", callerId: "CALLER-001", text: '"A truck just slammed into the bus stop. There\'s smoke everywhere."', status: "VERIFIED" as const },
  { time: "14:33:12", callerId: "CALLER-004", text: '"Station fire started. People are running out of the main entrance."', status: "VERIFIED" as const },
  { time: "14:34:45", callerId: "CALLER-012", text: '"I think there are 10 cars involved. I see 10 cars!"', status: "OUTLIER" as const },
];

// ─── Data Arbitrage Cross-References ─────────────────────────────────────────

export const mockArbitrageData = [
  { source: "Acoustic Sensor + 911 Audio", detail: 'Matching "muffled impact" frequency across 2 sources', status: "Link Confirmed", correlation: "0.98", icon: "compare_arrows" },
  { source: "Traffic CCTV + Social Metadata", detail: 'Congestion patterns aligning with reported "unauthorized crowd"', status: "Processing", correlation: "0.72", icon: "video_stable" },
  { source: "AQI Sensors + Low-Level Fire Calls", detail: "PM2.5 spike detected prior to dispatch reports", status: "Link Confirmed", correlation: "0.94", icon: "air" },
];
