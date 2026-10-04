import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchStudents from "./tools/search-students";
import listClasses from "./tools/list-classes";
import listStaff from "./tools/list-staff";
import feesSummary from "./tools/fees-summary";
import createInquiry from "./tools/create-inquiry";
import { allocateProxyTeacher } from "./tools/proxy";
import { analyzeTimetableClashes, optimizeTimetableSchedule, findAvailableSlotsTool } from "./tools/timetable";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "educore",
  title: "EduCore",
  version: "0.3.0",
  instructions:
    "Tools for the EduCore school and college management system. Use search_students and list_staff to look people up, list_classes for classes and sections, fees_summary for billing figures, and create_inquiry to record an admission enquiry. For timetables: analyze_timetable_clashes finds clashes, optimize_timetable_schedule fills empty slots clash-free (preview with apply=false before saving), find_available_slots finds common free periods, allocate_proxy_teacher finds and saves cover for absent teachers (preview first). All tools act as the signed-in user and only return records that user is allowed to see.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchStudents, listClasses, listStaff, feesSummary, createInquiry, analyzeTimetableClashes, optimizeTimetableSchedule, findAvailableSlotsTool, allocateProxyTeacher],
});
