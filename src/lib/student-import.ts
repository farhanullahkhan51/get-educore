/** School-format student sheet: the column names schools already use. */
export const SCHOOL_STUDENT_HEADERS = [
  "Adm. ID", "Adm. Date", "Student Name", "Father's Name", "Father's CNIC Number",
  "Gender", "DOB", "Mobile Number", "Phone Home", "Permanent Address",
  "Campus Name", "Class Name", "Section Name", "Fee",
] as const;

export const STUDENT_ID_RE = /^\d{5}$/;

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES: Record<string, string[]> = {
  adm_id: ["admid", "admissionid", "studentid", "studentcode", "id"],
  adm_date: ["admdate", "admissiondate"],
  student_name: ["studentname", "name"],
  father_name: ["fathersname", "fathername", "guardianname"],
  father_cnic: ["fatherscnicnumber", "fathercnicnumber", "fatherscnic", "fathercnic", "cnic"],
  gender: ["gender", "sex"],
  dob: ["dob", "dateofbirth"],
  mobile: ["mobilenumber", "mobile", "mobileno", "guardianphone"],
  phone_home: ["phonehome", "homephone"],
  address: ["permanentaddress", "address"],
  campus: ["campusname", "campus"],
  class_name: ["classname", "class"],
  section_name: ["sectionname", "section"],
  fee: ["fee", "monthlyfee", "tuitionfee"],
};
const LOOKUP = new Map<string, string>();
for (const [k, list] of Object.entries(ALIASES)) for (const a of list) LOOKUP.set(a, k);

/** Re-key one CSV row by our field names. The first non-empty duplicate column (e.g. two "Fee") wins. */
export function canonicalRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [h, v] of Object.entries(row)) {
    const key = LOOKUP.get(norm(h));
    const val = (v ?? "").trim();
    if (key && val && !out[key]) out[key] = val;
  }
  return out;
}

/** Accept YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY; return ISO date or null when invalid. */
export function parseDate(v: string): string | null {
  let y: number, m: number, d: number;
  let r = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) { y = +r[1]!; m = +r[2]!; d = +r[3]!; }
  else if ((r = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) { d = +r[1]!; m = +r[2]!; y = +r[3]!; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** 13-digit CNIC, returned as 12345-1234567-1. */
export function parseCnic(v: string): string | null {
  const d = v.replace(/\D/g, "");
  return d.length === 13 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : null;
}

export function parseGender(v: string): "male" | "female" | "other" | null {
  const g = v.trim().toLowerCase();
  if (["m", "male", "boy"].includes(g)) return "male";
  if (["f", "female", "girl"].includes(g)) return "female";
  if (g === "other") return "other";
  return null;
}

export type ParsedStudent = {
  student_code: string | null;
  admission_date: string | null;
  first_name: string;
  last_name: string;
  guardian_name: string | null;
  father_cnic: string | null;
  gender: string | null;
  date_of_birth: string | null;
  guardian_phone: string | null;
  phone_home: string | null;
  address: string | null;
  campus: string | null;
  class_name: string | null;
  section_name: string | null;
  monthly_fee: number | null;
};

/** Check one row; returns the cleaned student or the reason it can't be imported. */
export function parseStudentRow(raw: Record<string, string>): { ok: true; value: ParsedStudent } | { ok: false; error: string } {
  const r = canonicalRow(raw);
  const fail = (error: string) => ({ ok: false as const, error });
  if (!r["student_name"]) return fail("Student Name is required");
  if (r["adm_id"] && !STUDENT_ID_RE.test(r["adm_id"])) return fail("Adm. ID must be exactly 5 digits");
  const adm = r["adm_date"] ? parseDate(r["adm_date"]) : null;
  if (r["adm_date"] && !adm) return fail("Adm. Date is not a valid date (use DD/MM/YYYY)");
  const dob = r["dob"] ? parseDate(r["dob"]) : null;
  if (r["dob"] && !dob) return fail("DOB is not a valid date (use DD/MM/YYYY)");
  if (dob && adm && dob >= adm) return fail("DOB must be before Adm. Date");
  const cnic = r["father_cnic"] ? parseCnic(r["father_cnic"]) : null;
  if (r["father_cnic"] && !cnic) return fail("Father's CNIC must have 13 digits");
  const gender = r["gender"] ? parseGender(r["gender"]) : null;
  if (r["gender"] && !gender) return fail("Gender must be Male or Female");
  const mobile = r["mobile"] ?? null;
  if (mobile && mobile.replace(/\D/g, "").length < 10) return fail("Mobile Number looks too short");
  let fee: number | null = null;
  if (r["fee"]) {
    fee = Number(r["fee"].replace(/[,\s]|rs\.?|pkr/gi, ""));
    if (!Number.isFinite(fee) || fee < 0) return fail("Fee must be a number");
  }
  if (r["section_name"] && !r["class_name"]) return fail("Class Name is needed when Section Name is given");
  const [first, ...rest] = r["student_name"].split(/\s+/);
  return {
    ok: true,
    value: {
      student_code: r["adm_id"] ?? null,
      admission_date: adm,
      first_name: first!,
      last_name: rest.join(" "),
      guardian_name: r["father_name"] ?? null,
      father_cnic: cnic,
      gender,
      date_of_birth: dob,
      guardian_phone: mobile,
      phone_home: r["phone_home"] ?? null,
      address: r["address"] ?? null,
      campus: r["campus"] ?? null,
      class_name: r["class_name"] ?? null,
      section_name: r["section_name"] ?? null,
      monthly_fee: fee,
    },
  };
}
