export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assessment_scores: {
        Row: {
          assessment_id: string
          campus_id: string
          created_at: string
          entered_by: string | null
          id: string
          is_absent: boolean
          marks: number | null
          remarks: string | null
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          campus_id: string
          created_at?: string
          entered_by?: string | null
          id?: string
          is_absent?: boolean
          marks?: number | null
          remarks?: string | null
          student_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          campus_id?: string
          created_at?: string
          entered_by?: string | null
          id?: string
          is_absent?: boolean
          marks?: number | null
          remarks?: string | null
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_scores_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_scores_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_scores_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          academic_year: string | null
          campus_id: string
          course_id: string
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          max_marks: number
          section_id: string
          tenant_id: string
          term: string | null
          title: string
          type: Database["public"]["Enums"]["assessment_type"]
          updated_at: string
          weight_percent: number
        }
        Insert: {
          academic_year?: string | null
          campus_id: string
          course_id: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          max_marks?: number
          section_id: string
          tenant_id?: string
          term?: string | null
          title: string
          type?: Database["public"]["Enums"]["assessment_type"]
          updated_at?: string
          weight_percent?: number
        }
        Update: {
          academic_year?: string | null
          campus_id?: string
          course_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          max_marks?: number
          section_id?: string
          tenant_id?: string
          term?: string | null
          title?: string
          type?: Database["public"]["Enums"]["assessment_type"]
          updated_at?: string
          weight_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessments_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          campus_id: string
          course_id: string | null
          created_at: string
          date: string
          id: string
          marked_by: string | null
          remarks: string | null
          section_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          campus_id: string
          course_id?: string | null
          created_at?: string
          date: string
          id?: string
          marked_by?: string | null
          remarks?: string | null
          section_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          campus_id?: string
          course_id?: string | null
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          remarks?: string | null
          section_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          campus_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          campus_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          tenant_id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          campus_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string
          account_title: string
          active: boolean
          bank_name: string
          branch: string | null
          campus_id: string
          created_at: string
          iban: string | null
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_number: string
          account_title: string
          active?: boolean
          bank_name: string
          branch?: string | null
          campus_id: string
          created_at?: string
          iban?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          account_title?: string
          active?: boolean
          bank_name?: string
          branch?: string | null
          campus_id?: string
          created_at?: string
          iban?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          campus_id: string
          created_at: string
          description: string | null
          id: string
          import_batch: string | null
          matched_at: string | null
          matched_by: string | null
          matched_challan_id: string | null
          reference: string | null
          tenant_id: string
          txn_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          campus_id: string
          created_at?: string
          description?: string | null
          id?: string
          import_batch?: string | null
          matched_at?: string | null
          matched_by?: string | null
          matched_challan_id?: string | null
          reference?: string | null
          tenant_id?: string
          txn_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          campus_id?: string
          created_at?: string
          description?: string | null
          id?: string
          import_batch?: string | null
          matched_at?: string | null
          matched_by?: string | null
          matched_challan_id?: string | null
          reference?: string | null
          tenant_id?: string
          txn_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_challan_id_fkey"
            columns: ["matched_challan_id"]
            isOneToOne: false
            referencedRelation: "fee_challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      board_exam_entries: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_elective: boolean
          paper: string | null
          practical_max: number
          registration_id: string
          subject_code: string
          subject_name: string
          tenant_id: string
          theory_max: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_elective?: boolean
          paper?: string | null
          practical_max?: number
          registration_id: string
          subject_code: string
          subject_name: string
          tenant_id?: string
          theory_max?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_elective?: boolean
          paper?: string | null
          practical_max?: number
          registration_id?: string
          subject_code?: string
          subject_name?: string
          tenant_id?: string
          theory_max?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_exam_entries_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "board_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_exam_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      board_registrations: {
        Row: {
          board_name: string
          campus_id: string
          created_at: string
          created_by: string | null
          exam_center: string | null
          group_name: Database["public"]["Enums"]["board_group"]
          id: string
          level: Database["public"]["Enums"]["board_level"]
          notes: string | null
          part: string | null
          registration_no: string | null
          roll_no: string | null
          session_year: string
          status: Database["public"]["Enums"]["board_registration_status"]
          student_id: string
          submitted_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          board_name: string
          campus_id: string
          created_at?: string
          created_by?: string | null
          exam_center?: string | null
          group_name: Database["public"]["Enums"]["board_group"]
          id?: string
          level: Database["public"]["Enums"]["board_level"]
          notes?: string | null
          part?: string | null
          registration_no?: string | null
          roll_no?: string | null
          session_year: string
          status?: Database["public"]["Enums"]["board_registration_status"]
          student_id: string
          submitted_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          board_name?: string
          campus_id?: string
          created_at?: string
          created_by?: string | null
          exam_center?: string | null
          group_name?: Database["public"]["Enums"]["board_group"]
          id?: string
          level?: Database["public"]["Enums"]["board_level"]
          notes?: string | null
          part?: string | null
          registration_no?: string | null
          roll_no?: string | null
          session_year?: string
          status?: Database["public"]["Enums"]["board_registration_status"]
          student_id?: string
          submitted_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_registrations_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_registrations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_registrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      board_results: {
        Row: {
          created_at: string
          entry_id: string
          grade: string | null
          id: string
          imported_at: string | null
          practical_marks: number | null
          remarks: string | null
          status: Database["public"]["Enums"]["board_result_status"]
          tenant_id: string
          theory_marks: number | null
          total_marks: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          grade?: string | null
          id?: string
          imported_at?: string | null
          practical_marks?: number | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["board_result_status"]
          tenant_id?: string
          theory_marks?: number | null
          total_marks?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          grade?: string | null
          id?: string
          imported_at?: string | null
          practical_marks?: number | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["board_result_status"]
          tenant_id?: string
          theory_marks?: number | null
          total_marks?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_results_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "board_exam_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campuses: {
        Row: {
          academic_system: Database["public"]["Enums"]["academic_system"]
          address: string | null
          code: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_system?: Database["public"]["Enums"]["academic_system"]
          address?: string | null
          code: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          academic_system?: Database["public"]["Enums"]["academic_system"]
          address?: string | null
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campuses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_system: Database["public"]["Enums"]["academic_system"]
          academic_year: string | null
          campus_id: string
          created_at: string
          grade_level: string | null
          id: string
          name: string
          program_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_system?: Database["public"]["Enums"]["academic_system"]
          academic_year?: string | null
          campus_id: string
          created_at?: string
          grade_level?: string | null
          id?: string
          name: string
          program_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          academic_system?: Database["public"]["Enums"]["academic_system"]
          academic_year?: string | null
          campus_id?: string
          created_at?: string
          grade_level?: string | null
          id?: string
          name?: string
          program_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      course_assignments: {
        Row: {
          academic_year: string | null
          campus_id: string
          course_id: string
          created_at: string
          id: string
          section_id: string
          teacher_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          campus_id: string
          course_id: string
          created_at?: string
          id?: string
          section_id: string
          teacher_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          campus_id?: string
          course_id?: string
          created_at?: string
          id?: string
          section_id?: string
          teacher_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_assignments_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_assignments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          academic_system: string | null
          campus_id: string
          class_id: string | null
          code: string
          created_at: string
          credit_hours: number | null
          description: string | null
          id: string
          is_active: boolean
          program_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          academic_system?: string | null
          campus_id: string
          class_id?: string | null
          code: string
          created_at?: string
          credit_hours?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          program_id?: string | null
          tenant_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          academic_system?: string | null
          campus_id?: string
          class_id?: string | null
          code?: string
          created_at?: string
          credit_hours?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          program_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_challans: {
        Row: {
          campus_id: string
          category: Database["public"]["Enums"]["fee_category"]
          challan_no: string
          created_at: string
          created_by: string | null
          discount_amount: number
          due_date: string
          fee_structure_id: string | null
          fine_amount: number
          gross_amount: number
          id: string
          issue_date: string
          notes: string | null
          paid_amount: number
          paid_on: string | null
          period_label: string | null
          scholarship_id: string | null
          status: Database["public"]["Enums"]["challan_status"]
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          campus_id: string
          category?: Database["public"]["Enums"]["fee_category"]
          challan_no: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_date: string
          fee_structure_id?: string | null
          fine_amount?: number
          gross_amount: number
          id?: string
          issue_date?: string
          notes?: string | null
          paid_amount?: number
          paid_on?: string | null
          period_label?: string | null
          scholarship_id?: string | null
          status?: Database["public"]["Enums"]["challan_status"]
          student_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          campus_id?: string
          category?: Database["public"]["Enums"]["fee_category"]
          challan_no?: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_date?: string
          fee_structure_id?: string | null
          fine_amount?: number
          gross_amount?: number
          id?: string
          issue_date?: string
          notes?: string | null
          paid_amount?: number
          paid_on?: string | null
          period_label?: string | null
          scholarship_id?: string | null
          status?: Database["public"]["Enums"]["challan_status"]
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_challans_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_challans_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_challans_scholarship_id_fkey"
            columns: ["scholarship_id"]
            isOneToOne: false
            referencedRelation: "scholarships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_challans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_challans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_ledger: {
        Row: {
          amount: number
          bank_transaction_id: string | null
          campus_id: string
          challan_id: string
          created_at: string
          created_by: string | null
          entry_type: string
          id: string
          notes: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          bank_transaction_id?: string | null
          campus_id: string
          challan_id: string
          created_at?: string
          created_by?: string | null
          entry_type: string
          id?: string
          notes?: string | null
          tenant_id?: string
        }
        Update: {
          amount?: number
          bank_transaction_id?: string | null
          campus_id?: string
          challan_id?: string
          created_at?: string
          created_by?: string | null
          entry_type?: string
          id?: string
          notes?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_ledger_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_ledger_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_ledger_challan_id_fkey"
            columns: ["challan_id"]
            isOneToOne: false
            referencedRelation: "fee_challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          academic_year: string | null
          active: boolean
          amount: number
          campus_id: string
          category: Database["public"]["Enums"]["fee_category"]
          class_id: string | null
          created_at: string
          created_by: string | null
          frequency: Database["public"]["Enums"]["fee_frequency"]
          id: string
          name: string
          notes: string | null
          program_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          active?: boolean
          amount: number
          campus_id: string
          category?: Database["public"]["Enums"]["fee_category"]
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          frequency?: Database["public"]["Enums"]["fee_frequency"]
          id?: string
          name: string
          notes?: string | null
          program_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          active?: boolean
          amount?: number
          campus_id?: string
          category?: Database["public"]["Enums"]["fee_category"]
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          frequency?: Database["public"]["Enums"]["fee_frequency"]
          id?: string
          name?: string
          notes?: string | null
          program_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_scales: {
        Row: {
          bands: Json
          campus_id: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bands: Json
          campus_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          bands?: Json
          campus_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_scales_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_scales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          academic_system: Database["public"]["Enums"]["academic_system"] | null
          address: string | null
          assigned_to: string | null
          campus_id: string | null
          converted_at: string | null
          converted_student_id: string | null
          created_at: string
          grade_applying_for: string | null
          guardian_email: string | null
          guardian_name: string
          guardian_phone: string
          guardian_relation: string | null
          id: string
          notes: string | null
          previous_school: string | null
          program_id: string | null
          source: string | null
          status: Database["public"]["Enums"]["inquiry_status"]
          student_dob: string | null
          student_gender: string | null
          student_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_system?:
            | Database["public"]["Enums"]["academic_system"]
            | null
          address?: string | null
          assigned_to?: string | null
          campus_id?: string | null
          converted_at?: string | null
          converted_student_id?: string | null
          created_at?: string
          grade_applying_for?: string | null
          guardian_email?: string | null
          guardian_name: string
          guardian_phone: string
          guardian_relation?: string | null
          id?: string
          notes?: string | null
          previous_school?: string | null
          program_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          student_dob?: string | null
          student_gender?: string | null
          student_name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          academic_system?:
            | Database["public"]["Enums"]["academic_system"]
            | null
          address?: string | null
          assigned_to?: string | null
          campus_id?: string | null
          converted_at?: string | null
          converted_student_id?: string | null
          created_at?: string
          grade_applying_for?: string | null
          guardian_email?: string | null
          guardian_name?: string
          guardian_phone?: string
          guardian_relation?: string | null
          id?: string
          notes?: string | null
          previous_school?: string | null
          program_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          student_dob?: string | null
          student_gender?: string | null
          student_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_converted_student_id_fkey"
            columns: ["converted_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_tiers: {
        Row: {
          campus_limit: number | null
          created_at: string
          feature_flags: Json
          id: string
          name: string
          student_limit: number | null
          updated_at: string
        }
        Insert: {
          campus_limit?: number | null
          created_at?: string
          feature_flags?: Json
          id?: string
          name: string
          student_limit?: number | null
          updated_at?: string
        }
        Update: {
          campus_limit?: number | null
          created_at?: string
          feature_flags?: Json
          id?: string
          name?: string
          student_limit?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          campus_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          campus_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          campus_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          academic_system: Database["public"]["Enums"]["academic_system"]
          campus_id: string
          code: string
          created_at: string
          description: string | null
          duration_years: number | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_system?: Database["public"]["Enums"]["academic_system"]
          campus_id: string
          code: string
          created_at?: string
          description?: string | null
          duration_years?: number | null
          id?: string
          name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          academic_system?: Database["public"]["Enums"]["academic_system"]
          campus_id?: string
          code?: string
          created_at?: string
          description?: string | null
          duration_years?: number | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_cards: {
        Row: {
          academic_year: string
          attendance_percent: number | null
          campus_id: string
          created_at: string
          generated_by: string | null
          gpa: number | null
          id: string
          overall_percent: number | null
          published_at: string | null
          remarks: string | null
          section_id: string | null
          status: Database["public"]["Enums"]["report_card_status"]
          student_id: string
          subjects: Json
          tenant_id: string
          term: string
          updated_at: string
        }
        Insert: {
          academic_year: string
          attendance_percent?: number | null
          campus_id: string
          created_at?: string
          generated_by?: string | null
          gpa?: number | null
          id?: string
          overall_percent?: number | null
          published_at?: string | null
          remarks?: string | null
          section_id?: string | null
          status?: Database["public"]["Enums"]["report_card_status"]
          student_id: string
          subjects?: Json
          tenant_id?: string
          term: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          attendance_percent?: number | null
          campus_id?: string
          created_at?: string
          generated_by?: string | null
          gpa?: number | null
          id?: string
          overall_percent?: number | null
          published_at?: string | null
          remarks?: string | null
          section_id?: string | null
          status?: Database["public"]["Enums"]["report_card_status"]
          student_id?: string
          subjects?: Json
          tenant_id?: string
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scholarships: {
        Row: {
          approved_by: string | null
          campus_id: string
          created_at: string
          ends_on: string | null
          id: string
          name: string
          reason: string | null
          scholarship_type: Database["public"]["Enums"]["scholarship_type"]
          starts_on: string | null
          status: Database["public"]["Enums"]["scholarship_status"]
          student_id: string
          tenant_id: string
          updated_at: string
          value: number
        }
        Insert: {
          approved_by?: string | null
          campus_id: string
          created_at?: string
          ends_on?: string | null
          id?: string
          name: string
          reason?: string | null
          scholarship_type?: Database["public"]["Enums"]["scholarship_type"]
          starts_on?: string | null
          status?: Database["public"]["Enums"]["scholarship_status"]
          student_id: string
          tenant_id?: string
          updated_at?: string
          value: number
        }
        Update: {
          approved_by?: string | null
          campus_id?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          name?: string
          reason?: string | null
          scholarship_type?: Database["public"]["Enums"]["scholarship_type"]
          starts_on?: string | null
          status?: Database["public"]["Enums"]["scholarship_status"]
          student_id?: string
          tenant_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "scholarships_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarships_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholarships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          academic_system: Database["public"]["Enums"]["academic_system"]
          campus_id: string
          capacity: number | null
          class_id: string
          created_at: string
          id: string
          name: string
          room: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_system?: Database["public"]["Enums"]["academic_system"]
          campus_id: string
          capacity?: number | null
          class_id: string
          created_at?: string
          id?: string
          name: string
          room?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          academic_system?: Database["public"]["Enums"]["academic_system"]
          campus_id?: string
          capacity?: number | null
          class_id?: string
          created_at?: string
          id?: string
          name?: string
          room?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          address: string | null
          campus_id: string
          created_at: string
          date_of_joining: string | null
          department: string | null
          designation: string | null
          documents: Json | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          profile_id: string | null
          qualification: string | null
          staff_code: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          campus_id: string
          created_at?: string
          date_of_joining?: string | null
          department?: string | null
          designation?: string | null
          documents?: Json | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          profile_id?: string | null
          qualification?: string | null
          staff_code: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          campus_id?: string
          created_at?: string
          date_of_joining?: string | null
          department?: string | null
          designation?: string | null
          documents?: Json | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          profile_id?: string | null
          qualification?: string | null
          staff_code?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_payroll: {
        Row: {
          amount: number
          campus_id: string
          created_at: string
          created_by: string | null
          effective_date: string
          entry_type: string
          id: string
          note: string | null
          staff_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          campus_id: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          entry_type: string
          id?: string
          note?: string | null
          staff_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          campus_id?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          entry_type?: string
          id?: string
          note?: string | null
          staff_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_payroll_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payroll_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payroll_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          academic_system: Database["public"]["Enums"]["academic_system"]
          address: string | null
          admission_date: string | null
          campus_id: string
          class_id: string | null
          created_at: string
          date_of_birth: string | null
          documents: Json | null
          first_name: string
          gender: string | null
          grade: string | null
          guardian_name: string | null
          guardian_occupation: string | null
          guardian_phone: string | null
          id: string
          last_name: string
          profile_id: string | null
          program_id: string | null
          section_id: string | null
          status: string
          student_code: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_system?: Database["public"]["Enums"]["academic_system"]
          address?: string | null
          admission_date?: string | null
          campus_id: string
          class_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          documents?: Json | null
          first_name: string
          gender?: string | null
          grade?: string | null
          guardian_name?: string | null
          guardian_occupation?: string | null
          guardian_phone?: string | null
          id?: string
          last_name: string
          profile_id?: string | null
          program_id?: string | null
          section_id?: string | null
          status?: string
          student_code: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          academic_system?: Database["public"]["Enums"]["academic_system"]
          address?: string | null
          admission_date?: string | null
          campus_id?: string
          class_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          documents?: Json | null
          first_name?: string
          gender?: string | null
          grade?: string | null
          guardian_name?: string | null
          guardian_occupation?: string | null
          guardian_phone?: string | null
          id?: string
          last_name?: string
          profile_id?: string | null
          program_id?: string | null
          section_id?: string | null
          status?: string
          student_code?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          created_at: string
          current_period_end: string | null
          id: string
          plan_tier_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_tier_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_tier_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_tier_id_fkey"
            columns: ["plan_tier_id"]
            isOneToOne: false
            referencedRelation: "plan_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          accent_color: string | null
          created_at: string
          default_currency: string
          default_timezone: string
          email_sender_name: string | null
          favicon_url: string | null
          font: string | null
          letterhead_url: string | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          signature_url: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          default_currency?: string
          default_timezone?: string
          email_sender_name?: string | null
          favicon_url?: string | null
          font?: string | null
          letterhead_url?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          signature_url?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          default_currency?: string
          default_timezone?: string
          email_sender_name?: string | null
          favicon_url?: string | null
          font?: string | null
          letterhead_url?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          signature_url?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          custom_domain: string | null
          custom_domain_status: Database["public"]["Enums"]["custom_domain_status"]
          domain_verification_token: string
          id: string
          name: string
          plan_tier_id: string | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_domain?: string | null
          custom_domain_status?: Database["public"]["Enums"]["custom_domain_status"]
          domain_verification_token?: string
          id?: string
          name: string
          plan_tier_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_domain?: string | null
          custom_domain_status?: Database["public"]["Enums"]["custom_domain_status"]
          domain_verification_token?: string
          id?: string
          name?: string
          plan_tier_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_tier_id_fkey"
            columns: ["plan_tier_id"]
            isOneToOne: false
            referencedRelation: "plan_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          campus_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id: string
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_fees: {
        Args: { _campus_id: string; _user_id: string }
        Returns: boolean
      }
      get_user_campus: { Args: { _user_id: string }; Returns: string }
      get_user_tenant: { Args: { _user_id: string }; Returns: string }
      has_campus_access: {
        Args: { _campus_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_student_owner: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      resolve_tenant_by_host: {
        Args: { _host: string }
        Returns: {
          accent_color: string
          custom_domain: string
          default_currency: string
          default_timezone: string
          email_sender_name: string
          favicon_url: string
          font: string
          id: string
          letterhead_url: string
          logo_url: string
          name: string
          primary_color: string
          secondary_color: string
          signature_url: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
        }[]
      }
      student_has_outstanding_challans: {
        Args: { _student_id: string }
        Returns: boolean
      }
      teacher_of_course_section: {
        Args: { _course_id: string; _section_id: string; _user_id: string }
        Returns: boolean
      }
      teacher_of_section: {
        Args: { _section_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      academic_system: "board" | "cambridge" | "both"
      app_role:
        | "super_admin"
        | "campus_admin"
        | "admissions_officer"
        | "finance_officer"
        | "teacher"
        | "student"
      assessment_type:
        | "quiz"
        | "assignment"
        | "midterm"
        | "final"
        | "project"
        | "other"
      attendance_status: "present" | "absent" | "late" | "leave"
      billing_cycle: "monthly" | "yearly"
      board_group:
        | "science"
        | "arts"
        | "commerce"
        | "pre_medical"
        | "pre_engineering"
        | "computer_science"
        | "general"
      board_level: "matric" | "inter"
      board_registration_status:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "cancelled"
      board_result_status: "pass" | "fail" | "absent" | "withheld" | "pending"
      challan_status: "unpaid" | "partial" | "paid" | "waived" | "overdue"
      custom_domain_status:
        | "pending"
        | "verifying"
        | "verified"
        | "active"
        | "failed"
      fee_category:
        | "tuition"
        | "admission"
        | "exam"
        | "transport"
        | "hostel"
        | "other"
      fee_frequency: "monthly" | "term" | "annual" | "one_time"
      inquiry_status: "new" | "contacted" | "visited" | "converted" | "lost"
      report_card_status: "draft" | "published" | "locked"
      scholarship_status: "active" | "expired" | "revoked"
      scholarship_type: "percentage" | "fixed"
      subscription_status: "active" | "past_due" | "canceled" | "trialing"
      tenant_status: "active" | "suspended" | "trial"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      academic_system: ["board", "cambridge", "both"],
      app_role: [
        "super_admin",
        "campus_admin",
        "admissions_officer",
        "finance_officer",
        "teacher",
        "student",
      ],
      assessment_type: [
        "quiz",
        "assignment",
        "midterm",
        "final",
        "project",
        "other",
      ],
      attendance_status: ["present", "absent", "late", "leave"],
      billing_cycle: ["monthly", "yearly"],
      board_group: [
        "science",
        "arts",
        "commerce",
        "pre_medical",
        "pre_engineering",
        "computer_science",
        "general",
      ],
      board_level: ["matric", "inter"],
      board_registration_status: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "cancelled",
      ],
      board_result_status: ["pass", "fail", "absent", "withheld", "pending"],
      challan_status: ["unpaid", "partial", "paid", "waived", "overdue"],
      custom_domain_status: [
        "pending",
        "verifying",
        "verified",
        "active",
        "failed",
      ],
      fee_category: [
        "tuition",
        "admission",
        "exam",
        "transport",
        "hostel",
        "other",
      ],
      fee_frequency: ["monthly", "term", "annual", "one_time"],
      inquiry_status: ["new", "contacted", "visited", "converted", "lost"],
      report_card_status: ["draft", "published", "locked"],
      scholarship_status: ["active", "expired", "revoked"],
      scholarship_type: ["percentage", "fixed"],
      subscription_status: ["active", "past_due", "canceled", "trialing"],
      tenant_status: ["active", "suspended", "trial"],
    },
  },
} as const
