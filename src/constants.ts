
import { SubjectConfig, TimeSlot } from './types';

export const CORE_SUBJECTS: SubjectConfig[] = [
  { name: 'Effective Communication', frequency: 2, isCore: true },
  { name: 'Mabisang Komunikasyon', frequency: 2, isCore: true },
  { name: 'General Mathematics', frequency: 4, isCore: true },
  { name: 'General Science', frequency: 4, isCore: true },
  { name: 'Life and Career Skills', frequency: 4, isCore: true },
  { name: 'PKLP', frequency: 4, isCore: true },
];

export const PATHWAY_ELECTIVES: Record<string, string[]> = {
  'BUSINESS AND ENTREPRENEURSHIP': ['Basic Accounting', 'Introduction to Organization and Management'],
  'SOCIAL SCIENCES': ['Intro to Philosophy', 'Creative Composition 1'],
  'ENGINEERING': ['Finite Math 1', 'Physics 1'],
  'SPORTS SCIENCES': ['Human Movement 1', 'Sports Coaching'],
  'HEALTH SCIENCES': ['Biology 1', 'Chemistry 1'],
};

export const MORNING_SLOTS: TimeSlot[] = [
  { start: '06:00', end: '07:00', isBreak: false, isHRGP: true },
  { start: '07:00', end: '08:00', isBreak: false, isHRGP: false },
  { start: '08:00', end: '09:00', isBreak: false, isHRGP: false },
  { start: '09:00', end: '09:15', isBreak: true, isHRGP: false },
  { start: '09:15', end: '10:15', isBreak: false, isHRGP: false },
  { start: '10:15', end: '11:15', isBreak: false, isHRGP: false },
  { start: '11:15', end: '12:15', isBreak: false, isHRGP: false },
];

export const AFTERNOON_SLOTS: TimeSlot[] = [
  { start: '12:30', end: '13:30', isBreak: false, isHRGP: true },
  { start: '13:30', end: '14:30', isBreak: false, isHRGP: false },
  { start: '14:30', end: '15:30', isBreak: false, isHRGP: false },
  { start: '15:30', end: '15:45', isBreak: true, isHRGP: false },
  { start: '15:45', end: '16:45', isBreak: false, isHRGP: false },
  { start: '16:45', end: '17:45', isBreak: false, isHRGP: false },
  { start: '17:45', end: '18:45', isBreak: false, isHRGP: false },
];

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
