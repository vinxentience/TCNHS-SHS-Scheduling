import { 
  Teacher, 
  ClassSection, 
  WeeklySchedule, 
  SolverResult, 
  ScheduleEntry, 
  SubjectConfig 
} from './types';
import { 
  CORE_SUBJECTS, 
  PATHWAY_ELECTIVES, 
  MORNING_SLOTS, 
  AFTERNOON_SLOTS,
  DAYS
} from './constants';

export class Scheduler {
  private teachers: Teacher[];
  private sections: ClassSection[];
  public schedule: WeeklySchedule = {};
  public teacherLoad: Record<string, number> = {};
  private teacherDailyLoad: Record<string, Record<number, number>> = {};
  private teacherSubjects: Record<string, Set<string>> = {};

  constructor(teachers: Teacher[], sections: ClassSection[]) {
    this.teachers = teachers;
    this.sections = sections;
    this.initialize();
  }

  private initialize() {
    this.sections.forEach(s => {
      this.schedule[s.id] = {};
      for (let day = 0; day < 5; day++) {
        const slots = s.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS;
        this.schedule[s.id][day] = new Array(slots.length).fill(null);
      }
    });

    this.teachers.forEach(t => {
      this.teacherLoad[t.id] = 0;
      this.teacherDailyLoad[t.id] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
      this.teacherSubjects[t.id] = new Set();
    });
  }

  public solve(): SolverResult {
    // 1. Assign HRGP (Monday only, must be Adviser)
    this.assignHRGP();

    // 2. Prepare subject requirements for each section
    const requirements = this.prepareRequirements();

    // 3. Multi-pass assignment to ensure all teachers get load and avoid greedy pitfalls
    
    // PASS 1: Critical Subject Distribution (Bottlenecks)
    // Subjects with only 1 available teacher should be placed first
    this.assignCriticalBottlenecks(requirements);

    // PASS 2: Mandatory Distribution - Try to give every teacher at least one requirement
    this.assignMandatoryDistribution(requirements);

    // PASS 3: Sequential assignment for remaining requirements
    this.assignSequentially(requirements);

    return {
      schedule: this.schedule,
      teacherLoad: this.teacherLoad,
      unassigned: requirements
        .filter(r => r.count > 0)
        .map(r => {
          const section = this.sections.find(s => s.id === r.sectionId);
          const sectionName = section ? section.name : 'Unknown Section';
          return `${r.sectionId} [${sectionName}]: ${r.subjectName} (${r.count} hrs) - ${r.error || this.getDeepDiagnostic(r)}`;
        })
    };
  }

  public attemptMagicFix(sectionId: string, subjectName: string): { success: boolean, message?: string, details?: string[] } {
    const section = this.sections.find(s => s.id === sectionId);
    if (!section) return { success: false, message: 'Section not found' };
    const slots = section.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS;

    // 1. Identify what's missing
    this.assignHRGP(); // Ensure HRGP is there
    const requirements = this.prepareRequirements();
    const targetReq = requirements.find(r => r.sectionId === sectionId && r.subjectName === subjectName);
    if (!targetReq || targetReq.count <= 0) return { success: true, message: 'Subject already fully assigned' };

    // 2. Qualified teachers
    const qualified = this.teachers.filter(t => 
      t.preferredSubjects.some(ps => ps.toLowerCase() === subjectName.toLowerCase())
    );

    for (const teacher of qualified) {
      if (this.teacherLoad[teacher.id] + targetReq.count > 30) continue;

      // 3. Look for a "Swap Chain"
      const foundSlots: { day: number; sIdx: number; displacedEntry: any }[] = [];
      const steps: string[] = [];
      
      for (let day = 0; day < 5 && foundSlots.length < targetReq.count; day++) {
        for (let sIdx = 0; sIdx < slots.length && foundSlots.length < targetReq.count; sIdx++) {
          if (slots[sIdx].isBreak || (slots[sIdx].isHRGP && day === 0)) continue;
          
          const currentEntry = this.schedule[sectionId][day][sIdx];
          
          // Can our teacher teach here?
          if (this.canTeacherPerform(teacher, section, day, sIdx, slots)) {
            // If slot is empty, easy win
            if (!currentEntry) {
              foundSlots.push({ day, sIdx, displacedEntry: null });
              steps.push(`Placed ${subjectName} in empty slot on ${DAYS[day]} at ${slots[sIdx].start}`);
              continue;
            }

            // If slot is busy, can we displace currentEntry to another slot?
            const displacedTeacher = this.teachers.find(t => t.id === currentEntry.teacherId);
            if (!displacedTeacher) continue;

            // Look for a hole for the displaced teacher
            let holeFound = false;
            for (let d2 = 0; d2 < 5 && !holeFound; d2++) {
              for (let i2 = 0; i2 < slots.length && !holeFound; i2++) {
                if (slots[i2].isBreak || (slots[i2].isHRGP && d2 === 0)) continue;
                if (this.schedule[sectionId][d2][i2] === null && this.canTeacherPerform(displacedTeacher, section, d2, i2, slots)) {
                  // Found a hole!
                  foundSlots.push({ day, sIdx, displacedEntry: { ...currentEntry, day: d2, slotIndex: i2 } });
                  steps.push(`Displaced ${currentEntry.subjectName} (${displacedTeacher.name}) from ${DAYS[day]} ${slots[sIdx].start} to ${DAYS[d2]} ${slots[i2].start} to make room for ${subjectName}`);
                  holeFound = true;
                }
              }
            }
          }
        }
      }

      if (foundSlots.length === targetReq.count) {
        // EXECUTE SWAP
        foundSlots.forEach(fs => {
          this.schedule[sectionId][fs.day][fs.sIdx] = null;
          if (fs.displacedEntry) {
            this.schedule[sectionId][fs.displacedEntry.day][fs.displacedEntry.slotIndex] = fs.displacedEntry;
          }
          this.schedule[sectionId][fs.day][fs.sIdx] = {
            day: fs.day,
            slotIndex: fs.sIdx,
            subjectName: subjectName,
            teacherId: teacher.id,
            classId: sectionId
          };
        });
        this.teacherLoad[teacher.id] += targetReq.count;
        return { 
          success: true, 
          message: `Successfully resolved conflict for ${subjectName} in Section ${section.name}`,
          details: steps 
        };
      }
    }

    return { success: false, message: 'No non-conflicting adjustment found' };
  }

  public balanceLoad(): { success: boolean, message: string, details: string[] } {
    let movedCount = 0;
    const details: string[] = [];
    
    // Sort teachers by current load descending to find those to offload
    const sources = this.teachers
      .filter(t => this.teacherLoad[t.id] > 18)
      .sort((a, b) => this.teacherLoad[b.id] - this.teacherLoad[a.id]);

    for (const teacherA of sources) {
      // Find potential recipients with significantly lower load
      const recipients = this.teachers
        .filter(t => this.teacherLoad[t.id] < this.teacherLoad[teacherA.id] - 4)
        .sort((a, b) => this.teacherLoad[a.id] - this.teacherLoad[b.id]);

      if (recipients.length === 0) continue;

      // Scan schedule for teacherA's assignments
      for (const sectionId of Object.keys(this.schedule)) {
        const section = this.sections.find(s => s.id === sectionId)!;
        const slots = section.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS;

        for (let day = 0; day < 5; day++) {
          for (let sIdx = 0; sIdx < this.schedule[sectionId][day].length; sIdx++) {
            const entry = this.schedule[sectionId][day][sIdx];
            
            // Do not move HRGP (Adviser specific)
            if (entry && entry.teacherId === teacherA.id && entry.subjectName !== 'HRGP') {
              for (const teacherB of recipients) {
                // Check if teacherB is qualified
                if (!teacherB.preferredSubjects.some(ps => ps.toLowerCase() === entry.subjectName.toLowerCase())) continue;

                // Check constraints (bypassing the 'is slot empty' check since we are replacing)
                if (this.canAssign(teacherB, section, day, sIdx, slots, entry.subjectName, true)) {
                  // Execute swap
                  this.schedule[sectionId][day][sIdx].teacherId = teacherB.id;
                  this.teacherLoad[teacherA.id]--;
                  this.teacherLoad[teacherB.id]++;
                  this.teacherDailyLoad[teacherA.id][day]--;
                  this.teacherDailyLoad[teacherB.id][day]++;
                  
                  details.push(`${teacherA.name} → ${teacherB.name}: ${entry.subjectName} (${section.name})`);
                  movedCount++;
                  
                  // Limit moves per teacher to keep it stable
                  if (movedCount > 15) return {
                    success: true,
                    message: `Re-balanced ${movedCount} subject loads to equalize teacher distribution.`,
                    details
                  };
                  
                  // Move to next entry after successful swap for this one
                  gotoNextEntry: break; 
                }
              }
            }
          }
        }
      }
    }

    return {
      success: movedCount > 0,
      message: movedCount > 0 ? `Re-balanced ${movedCount} subject loads to equalize teacher distribution.` : "Load distribution is already optimal.",
      details
    };
  }

  private canTeacherPerform(teacher: Teacher, section: ClassSection, day: number, slotIndex: number, slots: any[]): boolean {
    const currentSlot = slots[slotIndex];
    if (!currentSlot) return false;
    const curStart = this.timeToMinutes(currentSlot.start);
    const curEnd = this.timeToMinutes(currentSlot.end);
    const tIn = this.timeToMinutes(teacher.timeIn);
    const tOut = this.timeToMinutes(teacher.timeOut);
    if (curStart < tIn || curEnd > tOut) return false;

    // Teacher busy elsewhere?
    const busy = Object.keys(this.schedule).some(secId => {
      const daySched = this.schedule[secId][day];
      if (!daySched) return false;
      const sec = this.sections.find(s => s.id === secId);
      const secSlots = sec?.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS;
      return daySched.some((entry, idx) => {
        if (!entry || entry.teacherId !== teacher.id) return false;
        const eSlot = secSlots[idx];
        return (curStart < this.timeToMinutes(eSlot.end)) && (curEnd > this.timeToMinutes(eSlot.start));
      });
    });
    return !busy;
  }

  private assignCriticalBottlenecks(requirements: any[]) {
    const bottleneckReqs = requirements.filter(req => {
      const qualified = this.teachers.filter(t => 
        t.preferredSubjects.some(ps => ps.toLowerCase() === req.subjectName.toLowerCase())
      );
      return qualified.length === 1;
    });

    bottleneckReqs.forEach(req => {
      const teacher = this.teachers.find(t => 
        t.preferredSubjects.some(ps => ps.toLowerCase() === req.subjectName.toLowerCase())
      );
      if (!teacher) return;
      const section = this.sections.find(s => s.id === req.sectionId);
      if (!section) return;
      const slots = (section.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS);
      this.greedyAssign(req, teacher, section, slots);
    });
  }

  private getDeepDiagnostic(req: any): string {
    const section = this.sections.find(s => s.id === req.sectionId);
    if (!section) return 'Invalid section';
    const qualified = this.teachers.filter(t => 
      t.preferredSubjects.some(ps => ps.toLowerCase() === req.subjectName.toLowerCase())
    );

    if (qualified.length === 0) return 'No qualified teachers';
    
    const details: string[] = [];
    qualified.forEach(t => {
      const coverage = this.getTeacherSessionCoverage(t, section.sessionType);
      if (coverage === 0) {
        details.push(`${t.name}: Shift Mismatch`);
      } else if (this.teacherLoad[t.id] >= 30) {
        details.push(`${t.name}: Max Load (30/30)`);
      } else {
        // Find blocking subjects in the section schedule
        const blockingSubjects = new Set<string>();
        const daySched = this.schedule[section.id];
        Object.values(daySched).forEach((daySlots) => {
          daySlots.forEach(slot => {
            if (slot) blockingSubjects.add(`${slot.subjectName} (${this.teachers.find(teacher => teacher.id === slot.teacherId)?.name})`);
          });
        });
        details.push(`${t.name}: All slots blocked by existing classes (${Array.from(blockingSubjects).slice(0, 2).join(', ')}...)`);
      }
    });

    return details.slice(0, 2).join(' | ');
  }

  private assignMandatoryDistribution(requirements: any[]) {
    // Collect teachers who haven't been assigned anything after HRGP
    // We sort them so that we process teachers with strictly 0 load first
    const idleTeachers = this.teachers
      .filter(t => this.teacherLoad[t.id] === 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    
    idleTeachers.forEach(teacher => {
      // Find ALL requirements this teacher is qualified for
      const potentialReqs = requirements.filter(req => 
        req.count > 0 && 
        teacher.preferredSubjects.some(ps => ps.toLowerCase() === req.subjectName.toLowerCase())
      );

      // Try each potential requirement until one works
      for (const req of potentialReqs) {
        const section = this.sections.find(s => s.id === req.sectionId);
        if (!section) continue;
        const slots = (section.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS);
        
        if (this.greedyAssign(req, teacher, section, slots)) {
          break; // Successfully assigned their first "real" load
        }
      }
    });
  }

  private assignSequentially(requirements: any[]) {
    requirements.forEach((req) => {
      if (req.count === 0) return;

      const section = this.sections.find(s => s.id === req.sectionId);
      if (!section) {
        req.error = `Invalid section ID: ${req.sectionId}`;
        return;
      }
      const slots = (section.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS);

      const qualifiedTeachers = this.teachers.filter(t => 
        t.preferredSubjects.some(ps => ps.toLowerCase() === req.subjectName.toLowerCase())
      );

      if (qualifiedTeachers.length === 0) {
        req.error = `No teacher found with '${req.subjectName}' preference`;
        return;
      }

      // Diagnose conflicts for reporting
      const diagnostics: string[] = [];
      qualifiedTeachers.forEach(t => {
        const coverage = this.getTeacherSessionCoverage(t, section.sessionType);
        if (coverage === 0) {
          diagnostics.push(`${t.name} (Shift Mismatch)`);
        } else if (this.teacherLoad[t.id] >= 30) {
          diagnostics.push(`${t.name} (Max Load)`);
        } else {
          diagnostics.push(`${t.name} (Schedule Conflict)`);
        }
      });
      const uniqueDiag = [...new Set(diagnostics)].slice(0, 3).join(', ');

      // Calculate subject-specific balance:
      // How many requirements of this subject does this teacher ALREADY have?
      const getSubjectCount = (tid: string) => {
        let count = 0;
        Object.values(this.schedule).forEach(sectionSched => {
          Object.values(sectionSched).forEach(daySched => {
            if (daySched.some(entry => entry?.teacherId === tid && entry.subjectName === req.subjectName)) {
              count++;
            }
          });
        });
        return count;
      };

      // Heuristic for balanced distribution:
      // 1. Prioritize teachers with smaller availability windows (Least Flexible) - Fixes conflicts for part-timers
      // 2. Prioritize teachers who cover more slots in THIS specific session (Flexibility in current context)
      // 3. Prioritize teachers with fewer sections of THIS specific subject
      // 4. Prioritize teachers with lower overall load
      qualifiedTeachers.sort((a, b) => {
        // Teacher "Window" Size - Smaller window is more constrained
        const aWindow = this.timeToMinutes(a.timeOut) - this.timeToMinutes(a.timeIn);
        const bWindow = this.timeToMinutes(b.timeOut) - this.timeToMinutes(b.timeIn);
        if (aWindow !== bWindow) return aWindow - bWindow;

        // Range coverage check: How many slots in this section's session does the teacher cover?
        const aCoverage = this.getTeacherSessionCoverage(a, section.sessionType);
        const bCoverage = this.getTeacherSessionCoverage(b, section.sessionType);
        if (aCoverage !== bCoverage) return bCoverage - aCoverage; 

        // Subject load balance
        const aSubCount = getSubjectCount(a.id);
        const bSubCount = getSubjectCount(b.id);
        if (aSubCount !== bSubCount) return aSubCount - bSubCount;

        // Overall load balance
        const loadA = this.teacherLoad[a.id];
        const loadB = this.teacherLoad[b.id];
        if (loadA !== loadB) return loadA - loadB;

        return this.teachers.indexOf(a) - this.teachers.indexOf(b);
      });

      let assigned = false;
      for (const teacher of qualifiedTeachers) {
        if (this.greedyAssign(req, teacher, section, slots)) {
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        req.error = `Conflicts with: ${uniqueDiag}`;
      }
    });
  }

  private getTeacherSessionCoverage(teacher: Teacher, sessionType: 'MORNING' | 'AFTERNOON'): number {
    const slots = sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS;
    const tIn = this.timeToMinutes(teacher.timeIn);
    const tOut = this.timeToMinutes(teacher.timeOut);
    
    let covered = 0;
    slots.forEach(slot => {
      const sStart = this.timeToMinutes(slot.start);
      const sEnd = this.timeToMinutes(slot.end);
      if (sStart >= tIn && sEnd <= tOut) covered++;
    });
    
    return covered;
  }

  private greedyAssign(req: any, teacher: Teacher, section: ClassSection, slots: any[]): boolean {
    const assignedSlots: { day: number; slot: number }[] = [];
    const addedSubject = !this.teacherSubjects[teacher.id].has(req.subjectName);

    // Distribute subjects across the week by rotating the starting day for each section/subject combo.
    // This prevents Fridays from always being vacant for 4-hour subjects.
    const sectionIndex = this.sections.findIndex(s => s.id === section.id);
    const dayOffset = (sectionIndex + req.subjectName.length) % 5;

    // Pass 1: Prioritize even distribution (Max 1 hour per day) with Compactness Scoring
    for (let i = 0; i < 5 && assignedSlots.length < req.count; i++) {
      const day = (i + dayOffset) % 5;
      
      // Rank available slots on this day by proximity to existing classes
      const candidateSlots: { sIdx: number, score: number }[] = [];
      
      for (let sIdx = 0; sIdx < slots.length; sIdx++) {
        if (slots[sIdx].isBreak) continue;
        if (slots[sIdx].isHRGP && day === 0) continue;

        if (this.canAssign(teacher, section, day, sIdx, slots, req.subjectName)) {
          // Compactness heuristic: higher score if adjacent slots have classes
          let score = 0;
          if (sIdx > 0 && this.isTeacherBusy(teacher.id, day, sIdx - 1)) score += 5;
          if (sIdx < slots.length - 1 && this.isTeacherBusy(teacher.id, day, sIdx + 1)) score += 5;
          
          // Section density check
          if (sIdx > 0 && this.isSectionBusy(section.id, day, sIdx - 1)) score += 2;
          
          candidateSlots.push({ sIdx, score });
        }
      }

      if (candidateSlots.length > 0) {
        // Pick the best slot for compactness
        candidateSlots.sort((a, b) => b.score - a.score);
        assignedSlots.push({ day, slot: candidateSlots[0].sIdx });
      }
    }

    // Pass 2: Fallback for packed schedule (Up to 2nd hour per day) - Prioritize back-to-back periods
    if (assignedSlots.length < req.count) {
      for (let i = 0; i < 5 && assignedSlots.length < req.count; i++) {
        const day = (i + dayOffset) % 5;
        
        // Count existing assignments on this day
        const dayCount = assignedSlots.filter(as => as.day === day).length;
        if (dayCount >= 2) continue; // Subject already has 2 hours on this day

        // Find existing assigned slot for this subject on this day (from Pass 1 or previous loop)
        const existingOnDay = assignedSlots.find(as => as.day === day);
        
        // Candidate ranking for double period
        const candidateSlots: { sIdx: number, score: number }[] = [];

        for (let sIdx = 0; sIdx < slots.length; sIdx++) {
          if (slots[sIdx].isBreak) continue;
          if (slots[sIdx].isHRGP && day === 0) continue;
          if (assignedSlots.some(as => as.day === day && as.slot === sIdx)) continue;

          if (this.canAssign(teacher, section, day, sIdx, slots, req.subjectName)) {
            let score = 0;
            // High priority for back-to-back blocks for the same subject
            if (existingOnDay && Math.abs(existingOnDay.slot - sIdx) === 1) score += 50;
            // General compactness (proximity to other classes)
            if (sIdx > 0 && this.isTeacherBusy(teacher.id, day, sIdx - 1)) score += 5;
            if (sIdx < slots.length - 1 && this.isTeacherBusy(teacher.id, day, sIdx + 1)) score += 5;

            candidateSlots.push({ sIdx, score });
          }
        }

        if (candidateSlots.length > 0) {
          candidateSlots.sort((a, b) => b.score - a.score);
          assignedSlots.push({ day, slot: candidateSlots[0].sIdx });
        }
      }
    }

    if (assignedSlots.length === req.count) {
      if (this.teacherLoad[teacher.id] + assignedSlots.length > 30) return false;

      assignedSlots.forEach(as => {
        this.schedule[section.id][as.day][as.slot] = {
          day: as.day,
          slotIndex: as.slot,
          subjectName: req.subjectName,
          teacherId: teacher.id,
          classId: section.id
        };
        this.teacherLoad[teacher.id]++;
        this.teacherDailyLoad[teacher.id][as.day]++;
      });
      if (addedSubject) this.teacherSubjects[teacher.id].add(req.subjectName);
      req.count = 0;
      return true;
    }

    return false;
  }

  private assignHRGP() {
    this.sections.forEach(section => {
      const day = 0; // Monday
      const slotIndex = 0; // HRGP is the first slot
      
      // Skip if already assigned
      if (this.schedule[section.id]?.[day]?.[slotIndex] !== null) return;
      
      const adviser = this.teachers.find(t => t.id === section.adviserId);
      if (adviser) {
        // Ensure day 0 slotIndex 0 exists for this section
        if (this.schedule[section.id] && this.schedule[section.id][day]) {
          this.schedule[section.id][day][slotIndex] = {
            day,
            slotIndex,
            subjectName: 'HRGP',
            teacherId: adviser.id,
            classId: section.id
          };
          this.teacherLoad[adviser.id]++;
          this.teacherDailyLoad[adviser.id][day]++;
        }
      }
    });
  }

  private prepareRequirements() {
    const list: { sectionId: string; subjectName: string; count: number; error?: string }[] = [];
    this.sections.forEach(section => {
      // Calculate how many hours are ALREADY assigned for each subject in this section
      const existingCounts: Record<string, number> = {};
      const sectionSched = this.schedule[section.id];
      if (sectionSched) {
        Object.values(sectionSched).forEach(daySched => {
          daySched.forEach(entry => {
            if (entry) {
              existingCounts[entry.subjectName] = (existingCounts[entry.subjectName] || 0) + 1;
            }
          });
        });
      }

      CORE_SUBJECTS.forEach(sub => {
        const remaining = sub.frequency - (existingCounts[sub.name] || 0);
        list.push({ sectionId: section.id, subjectName: sub.name, count: Math.max(0, remaining) });
      });
      
      const pathwayKey = Object.keys(PATHWAY_ELECTIVES).find(
        k => k === section.careerPathway?.toUpperCase()
      );
      
      const electives = pathwayKey ? PATHWAY_ELECTIVES[pathwayKey] : [];
      electives.forEach(sub => {
        const remaining = 4 - (existingCounts[sub] || 0);
        list.push({ sectionId: section.id, subjectName: sub, count: Math.max(0, remaining) });
      });
    });

    // Strategy: Prioritize subjects with fewer available teachers (Least Constrained) AND high hours
    return list.sort((a, b) => {
      const teachersA = this.teachers.filter(t => 
        t.preferredSubjects.some(ps => ps.toLowerCase() === a.subjectName.toLowerCase())
      ).length;
      const teachersB = this.teachers.filter(t => 
        t.preferredSubjects.some(ps => ps.toLowerCase() === b.subjectName.toLowerCase())
      ).length;
      
      // Heuristic: Teachers / Hours (Lower density = harder to fit)
      const densityA = teachersA / (a.count || 1);
      const densityB = teachersB / (b.count || 1);
      
      if (densityA !== densityB) return densityA - densityB;
      
      // Fallback to least teachers
      if (teachersA !== teachersB) return teachersA - teachersB;
      return b.count - a.count;
    });
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    // Rough normalization: if hour is < 7, assume it's PM (12:00 is special)
    // However, the constants are now 24h, so we just do standard conversion
    return h * 60 + m;
  }

  private canAssign(teacher: Teacher, section: ClassSection, day: number, slotIndex: number, slots: any[], subjectName: string, ignoreSectionConflict: boolean = false): boolean {
    // 1. Slot is free in section
    if (!ignoreSectionConflict && this.schedule[section.id][day][slotIndex] !== null) return false;

    // 2. Teacher is free at this time
    // Check all sections at this day specifically for time overlap
    const currentSlot = slots[slotIndex];
    const curStart = this.timeToMinutes(currentSlot.start);
    const curEnd = this.timeToMinutes(currentSlot.end);

    const teacherBusy = Object.keys(this.schedule).some(secId => {
      const daySchedule = this.schedule[secId][day];
      if (!daySchedule) return false;
      
      const sec = this.sections.find(s => s.id === secId);
      if (!sec) return false;
      const secSlots = sec.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS;

      return daySchedule.some((entry, sIdx) => {
        if (!entry || entry.teacherId !== teacher.id) return false;
        const entrySlot = secSlots[sIdx];
        const entStart = this.timeToMinutes(entrySlot.start);
        const entEnd = this.timeToMinutes(entrySlot.end);
        
        // Checks if times overlap: (StartA < EndB) && (EndA > StartB)
        return (curStart < entEnd) && (curEnd > entStart);
      });
    });
    if (teacherBusy) return false;

    // 3. Teacher load constraints (Max 6 hours/day, 30 hours/week)
    if (this.teacherDailyLoad[teacher.id][day] >= 6) return false;
    if (this.teacherLoad[teacher.id] >= 30) return false;

    // 4. Teacher presence (timeIn/timeOut)
    const tIn = this.timeToMinutes(teacher.timeIn);
    const tOut = this.timeToMinutes(teacher.timeOut);
    if (curStart < tIn || curEnd > tOut) return false;

    // 5. Subject limits (Max 3 distinct types)
    const currentSubjects = Array.from(this.teacherSubjects[teacher.id]);
    if (!currentSubjects.includes(subjectName) && currentSubjects.length >= 3) return false;

    // 6. Section Subject Daily Limit (Max 2 hours per subject per day)
    const subjectsOnDay = this.schedule[section.id][day].filter(
      entry => entry?.subjectName === subjectName
    ).length;
    if (subjectsOnDay >= 2) return false;

    return true;
  }

  private isTeacherBusy(teacherId: string, day: number, slotIndex: number): boolean {
    return Object.values(this.schedule).some(sectionDay => 
      sectionDay[day]?.[slotIndex]?.teacherId === teacherId
    );
  }

  private isSectionBusy(sectionId: string, day: number, slotIndex: number): boolean {
    return this.schedule[sectionId]?.[day]?.[slotIndex] !== null;
  }
}
