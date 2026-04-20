
export type SessionType = 'MORNING' | 'AFTERNOON';
export type CareerPathway = 'BUSINESS AND ENTREPRENEURSHIP' | 'SOCIAL SCIENCES' | 'ENGINEERING' | 'SPORTS SCIENCES' | 'HEALTH SCIENCES';

export interface Teacher {
  id: string;
  name: string;
  timeIn: string; // e.g. "06:00"
  timeOut: string; // e.g. "14:00"
  preferredSubjects: string[];
}

export interface ClassSection {
  id: string;
  name: string;
  sessionType: SessionType;
  careerPathway: CareerPathway;
  adviserId: string;
}

export interface SubjectConfig {
  name: string;
  frequency: number; // times per week
  isCore: boolean;
}

export interface ScheduleEntry {
  day: number; // 0-4 (Mon-Fri)
  slotIndex: number; 
  subjectName: string;
  teacherId: string;
  classId: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  isBreak: boolean;
  isHRGP: boolean;
}

export type WeeklySchedule = {
  [classId: string]: {
    [day: number]: (ScheduleEntry | null)[];
  };
};

export interface SolverResult {
  schedule: WeeklySchedule;
  teacherLoad: Record<string, number>;
  unassigned: string[];
}
