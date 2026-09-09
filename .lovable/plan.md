# Always separate Board from Cambridge

## What I found

Your records are correct: 13 classes (9 Board, 4 Cambridge), and every section and student matches its class's system — nothing is mislabelled in the database.

The problem is on screen. In Classes & Sections, the Board/Cambridge split is only an *optional* setting inside the Layout menu ("Group by: Board / Cambridge"). When it is off, every class — Grade 2 through Grade 10 plus O-1, O-2, A-1, A-2 — is listed in one flat run with no headings, so it reads as one undivided Board list. Only Courses currently separates the two systems by default, with blue Board and orange Cambridge headings.

Two more places let a wrong system slip in:
- The "New class" form always starts on **Board**, whatever campus or programme you pick.
- The "Add section" form has no system field at all, so a section silently keeps whatever it inherits.

The same "separation is optional" pattern applies to Students, Staff and Admissions, all of which default to no grouping. Timetable, Academics, Results and Certificates have no Board/Cambridge dimension at all.

## What to change

1. **Classes & Sections always splits by system.** Board and Cambridge get their own headings with counts, in the same blue/orange styling as Courses, whether or not a layout preference is saved. Institutions that run only one system see no extra headings. Campus and Academic-year grouping stay available as alternatives in the Layout menu.
2. **Students, Staff and Admissions default to the same split** for institutions running both systems, again overridable from Layout.
3. **New class inherits its system** from the chosen programme, or the campus when no programme is picked, instead of defaulting to Board. If the campus runs a single system, the choice is fixed and shown as such.
4. **Sections follow their class.** The Add/Edit section form shows the class's system as read-only, and section records are kept in step when a class's system is changed.
5. **A system badge everywhere a class or section is named** — the seating view, timetable pickers, results and certificates lists — so no screen shows a Cambridge class looking like a Board one.
6. **Timetable, Academics, Results and Certificates** get a Board/Cambridge filter in their Layout menu, so a Cambridge coordinator can work in their own set.
7. **One-off check** after the change: confirm each Board and Cambridge heading holds exactly the classes, sections and students the records say it should.

## Technical notes

- `src/lib/ui-arrange.ts` gains a "forced group" fallback so a module can supply a default group accessor that applies when `layout.groupBy === "none"`; `defaultsFor` in `src/lib/ui-layout.ts` sets `groupBy: "track"` for `classes`, `students`, `staff`, `admissions`.
- Track heading styling is factored out of `courses.tsx` into a small shared component (blue Board, orange Cambridge) used by `classes.tsx`, `students.tsx`, `staff.tsx`, `admissions.tsx`.
- Tenant `academic_system` from `TenantProvider` decides whether the split renders at all; single-system tenants keep a flat list.
- `classes.tsx` create form: derive `academic_system` from `programs.academic_system` / `campuses.academic_system`; section create/update writes the parent class's system rather than a form value; changing a class's system updates its sections in the same handler.
- Add `TRACK_FILTER` to the `timetable`, `academics`, `results` and `certificates` module specs, with matching filter accessors resolved through each row's class or student.
- No schema or data migration is required; existing saved layout preferences remain honoured when they name a real option.
