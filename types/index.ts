export interface ROIActivations {
  auditory: number;
  language: number;
  attention: number;
  dmn: number;
}

export interface Analysis {
  id: string;
  user_id: string;
  title: string;
  file_path: string;
  file_type: 'video' | 'audio';
  transcript: string | null;
  overall_score: number | null;
  duration_seconds: number | null;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error_message: string | null;
  created_at: string;
  overall_brain_activations: ROIActivations | null;
  is_mock: boolean | null;
}

export interface FeedbackPoint {
  id: string;
  analysis_id: string;
  timecode_ms: number;
  timecode_end_ms: number;
  engagement_score: number;
  feedback_text: string;
  improvement_suggestion: string;
  severity: 'low' | 'medium' | 'high';
  brain_activations: ROIActivations | null;
}

export interface EngagementTimepoint {
  id: string;
  analysis_id: string;
  timecode_ms: number;
  score: number;
}

export interface AnalysisDetail {
  analysis: Analysis;
  feedback_points: FeedbackPoint[];
  engagement_timeline: EngagementTimepoint[];
  file_url: string | null;
}
