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
      access_grants: {
        Row: {
          created_at: string
          granted_by: string
          id: string
          resource: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: string
          resource: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: string
          resource?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_recommendations: {
        Row: {
          created_at: string
          decided_at: string | null
          description: string | null
          estimated_minutes: number | null
          id: string
          input_snapshot: Json | null
          milestone_id: string | null
          model: string | null
          output_snapshot: Json | null
          priority: number | null
          project_id: string | null
          prompt_version: string | null
          provider: string | null
          rationale: string | null
          recommendation_date: string
          recommendation_type: string
          status: string
          task_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          input_snapshot?: Json | null
          milestone_id?: string | null
          model?: string | null
          output_snapshot?: Json | null
          priority?: number | null
          project_id?: string | null
          prompt_version?: string | null
          provider?: string | null
          rationale?: string | null
          recommendation_date: string
          recommendation_type: string
          status?: string
          task_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          input_snapshot?: Json | null
          milestone_id?: string | null
          model?: string | null
          output_snapshot?: Json | null
          priority?: number | null
          project_id?: string | null
          prompt_version?: string | null
          provider?: string | null
          rationale?: string | null
          recommendation_date?: string
          recommendation_type?: string
          status?: string
          task_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recommendations_milestone_id_project_id_fkey"
            columns: ["milestone_id", "project_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "ai_recommendations_milestone_id_user_id_fkey"
            columns: ["milestone_id", "user_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "ai_recommendations_project_id_user_id_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "ai_recommendations_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "task_plan_actual"
            referencedColumns: ["task_id", "user_id"]
          },
          {
            foreignKeyName: "ai_recommendations_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "ai_recommendations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          resource: string
          resource_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          resource: string
          resource_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          resource?: string
          resource_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          content: string | null
          cover_image_url: string | null
          created_at: string
          id: string
          is_published: boolean
          published_at: string | null
          slug: string
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          slug: string
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          slug?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_reflections: {
        Row: {
          created_at: string
          energy_score: number | null
          focus_score: number | null
          id: string
          mood_score: number | null
          note: string | null
          reflection_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          energy_score?: number | null
          focus_score?: number | null
          id?: string
          mood_score?: number | null
          note?: string | null
          reflection_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          energy_score?: number | null
          focus_score?: number | null
          id?: string
          mood_score?: number | null
          note?: string | null
          reflection_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_reflections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_tokens: {
        Row: {
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
          role: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          email?: string | null
          expires_at: string
          id?: string
          role?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          id?: string
          role?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      job_runs: {
        Row: {
          attempts: number
          detail: Json | null
          error_code: string | null
          finished_at: string | null
          id: string
          job_name: string
          run_key: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          detail?: Json | null
          error_code?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          run_key: string
          started_at?: string
          status: string
          user_id: string
        }
        Update: {
          attempts?: number
          detail?: Json | null
          error_code?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          run_key?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          sort_order: number
          status: string
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          sort_order?: number
          status?: string
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          sort_order?: number
          status?: string
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_user_id_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "milestones_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_projects: {
        Row: {
          content: string | null
          cover_image_url: string | null
          created_at: string
          demo_url: string | null
          github_url: string | null
          id: string
          is_featured: boolean
          is_published: boolean
          published_at: string | null
          slug: string
          summary: string | null
          tech_stack: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          demo_url?: string | null
          github_url?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          published_at?: string | null
          slug: string
          summary?: string | null
          tech_stack?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          demo_url?: string | null
          github_url?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          published_at?: string | null
          slug?: string
          summary?: string | null
          tech_stack?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      private_apps: {
        Row: {
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          priority: number
          start_date: string | null
          status: string
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          priority?: number
          start_date?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          priority?: number
          start_date?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resume_versions: {
        Row: {
          created_at: string
          data: Json
          id: string
          is_latest: boolean
          profile_id: string
          title: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          is_latest?: boolean
          profile_id: string
          title: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          is_latest?: boolean
          profile_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_versions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "resume_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_block_revisions: {
        Row: {
          actor: string
          change_type: string
          created_at: string
          id: string
          new_ends_at: string | null
          new_starts_at: string | null
          previous_ends_at: string | null
          previous_starts_at: string | null
          schedule_block_id: string
          user_id: string
        }
        Insert: {
          actor: string
          change_type: string
          created_at?: string
          id?: string
          new_ends_at?: string | null
          new_starts_at?: string | null
          previous_ends_at?: string | null
          previous_starts_at?: string | null
          schedule_block_id: string
          user_id: string
        }
        Update: {
          actor?: string
          change_type?: string
          created_at?: string
          id?: string
          new_ends_at?: string | null
          new_starts_at?: string | null
          previous_ends_at?: string | null
          previous_starts_at?: string | null
          schedule_block_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_block_revisions_schedule_block_id_user_id_fkey"
            columns: ["schedule_block_id", "user_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "schedule_block_revisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          is_locked: boolean
          source: string
          starts_at: string
          status: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          is_locked?: boolean
          source?: string
          starts_at: string
          status?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          is_locked?: boolean
          source?: string
          starts_at?: string
          status?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "task_plan_actual"
            referencedColumns: ["task_id", "user_id"]
          },
          {
            foreignKeyName: "schedule_blocks_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "schedule_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduler_settings: {
        Row: {
          auto_schedule_mode: string
          created_at: string
          default_break_minutes: number
          max_focus_block_minutes: number
          min_block_minutes: number
          show_actual_default: boolean
          slot_minutes: number
          updated_at: string
          user_id: string
          week_starts_on: number
          workday_end: string
          workday_start: string
          working_days: number[]
        }
        Insert: {
          auto_schedule_mode?: string
          created_at?: string
          default_break_minutes?: number
          max_focus_block_minutes?: number
          min_block_minutes?: number
          show_actual_default?: boolean
          slot_minutes?: number
          updated_at?: string
          user_id: string
          week_starts_on?: number
          workday_end?: string
          workday_start?: string
          working_days?: number[]
        }
        Update: {
          auto_schedule_mode?: string
          created_at?: string
          default_break_minutes?: number
          max_focus_block_minutes?: number
          min_block_minutes?: number
          show_actual_default?: boolean
          slot_minutes?: number
          updated_at?: string
          user_id?: string
          week_starts_on?: number
          workday_end?: string
          workday_start?: string
          working_days?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "scheduler_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      task_duration_profiles: {
        Row: {
          calculated_at: string
          complexity_bucket: number
          ewma_plan_actual_ratio: number | null
          median_actual_minutes: number | null
          median_plan_actual_ratio: number | null
          p75_actual_minutes: number | null
          recommended_correction_factor: number | null
          sample_count: number
          task_template_id: string
          user_id: string
        }
        Insert: {
          calculated_at?: string
          complexity_bucket?: number
          ewma_plan_actual_ratio?: number | null
          median_actual_minutes?: number | null
          median_plan_actual_ratio?: number | null
          p75_actual_minutes?: number | null
          recommended_correction_factor?: number | null
          sample_count?: number
          task_template_id: string
          user_id: string
        }
        Update: {
          calculated_at?: string
          complexity_bucket?: number
          ewma_plan_actual_ratio?: number | null
          median_actual_minutes?: number | null
          median_plan_actual_ratio?: number | null
          p75_actual_minutes?: number | null
          recommended_correction_factor?: number | null
          sample_count?: number
          task_template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_duration_profiles_task_template_id_user_id_fkey"
            columns: ["task_template_id", "user_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "task_duration_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          default_estimate_minutes: number | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          default_estimate_minutes?: number | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          default_estimate_minutes?: number | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          complexity: number
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          milestone_id: string | null
          priority: number
          project_id: string | null
          recommended_minutes: number | null
          sort_order: number
          status: string
          target_date: string | null
          template_id: string | null
          title: string
          updated_at: string
          user_estimated_minutes: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          complexity?: number
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          milestone_id?: string | null
          priority?: number
          project_id?: string | null
          recommended_minutes?: number | null
          sort_order?: number
          status?: string
          target_date?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
          user_estimated_minutes?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          complexity?: number
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          milestone_id?: string | null
          priority?: number
          project_id?: string | null
          recommended_minutes?: number | null
          sort_order?: number
          status?: string
          target_date?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
          user_estimated_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_milestone_id_project_id_fkey"
            columns: ["milestone_id", "project_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "tasks_milestone_id_user_id_fkey"
            columns: ["milestone_id", "user_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tasks_project_id_user_id_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tasks_template_id_user_id_fkey"
            columns: ["template_id", "user_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_reviews: {
        Row: {
          created_at: string
          id: string
          issues: Json
          metrics: Json
          model: string | null
          positives: Json
          prompt_version: string | null
          provider: string | null
          recommendations: Json
          summary: string
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          issues?: Json
          metrics: Json
          model?: string | null
          positives?: Json
          prompt_version?: string | null
          provider?: string | null
          recommendations?: Json
          summary: string
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          issues?: Json
          metrics?: Json
          model?: string | null
          positives?: Json
          prompt_version?: string | null
          provider?: string | null
          recommendations?: Json
          summary?: string
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_logs: {
        Row: {
          created_at: string
          energy_score: number | null
          focus_score: number | null
          id: string
          mood_score: number | null
          note: string | null
          session_id: string | null
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          energy_score?: number | null
          focus_score?: number | null
          id?: string
          mood_score?: number | null
          note?: string | null
          session_id?: string | null
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          energy_score?: number | null
          focus_score?: number | null
          id?: string
          mood_score?: number | null
          note?: string | null
          session_id?: string | null
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_logs_session_id_user_id_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "work_logs_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "task_plan_actual"
            referencedColumns: ["task_id", "user_id"]
          },
          {
            foreignKeyName: "work_logs_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "work_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_session_pauses: {
        Row: {
          created_at: string
          id: string
          paused_at: string
          reason: string | null
          resumed_at: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          paused_at: string
          reason?: string | null
          resumed_at?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          paused_at?: string
          reason?: string | null
          resumed_at?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_session_pauses_session_id_user_id_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "work_session_pauses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          schedule_block_id: string | null
          source: string
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          schedule_block_id?: string | null
          source?: string
          started_at: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          schedule_block_id?: string | null
          source?: string
          started_at?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_sessions_schedule_block_id_user_id_fkey"
            columns: ["schedule_block_id", "user_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "work_sessions_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "task_plan_actual"
            referencedColumns: ["task_id", "user_id"]
          },
          {
            foreignKeyName: "work_sessions_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "work_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      task_plan_actual: {
        Row: {
          actual_minutes: number | null
          average_focus: number | null
          completed_at: string | null
          complexity: number | null
          milestone_id: string | null
          paused_minutes: number | null
          planned_minutes: number | null
          project_id: string | null
          reschedule_count: number | null
          session_count: number | null
          skipped_minutes: number | null
          status: string | null
          task_id: string | null
          template_id: string | null
          user_estimated_minutes: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_milestone_id_project_id_fkey"
            columns: ["milestone_id", "project_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "tasks_milestone_id_user_id_fkey"
            columns: ["milestone_id", "user_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tasks_project_id_user_id_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tasks_template_id_user_id_fkey"
            columns: ["template_id", "user_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_ai_recommendation: {
        Args: {
          p_estimated_minutes?: number
          p_recommendation_id: string
          p_target_date?: string
          p_title?: string
        }
        Returns: {
          completed_at: string | null
          complexity: number
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          milestone_id: string | null
          priority: number
          project_id: string | null
          recommended_minutes: number | null
          sort_order: number
          status: string
          target_date: string | null
          template_id: string | null
          title: string
          updated_at: string
          user_estimated_minutes: number | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_schedule_block: {
        Args: {
          p_ends_at: string
          p_source?: string
          p_starts_at: string
          p_task_id: string
        }
        Returns: {
          created_at: string
          ends_at: string
          id: string
          is_locked: boolean
          source: string
          starts_at: string
          status: string
          task_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "schedule_blocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: never; Returns: boolean }
      mark_missed_blocks: { Args: { p_user_id: string }; Returns: number }
      move_schedule_block: {
        Args: { p_block_id: string; p_ends_at: string; p_starts_at: string }
        Returns: {
          created_at: string
          ends_at: string
          id: string
          is_locked: boolean
          source: string
          starts_at: string
          status: string
          task_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "schedule_blocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pause_work_session: {
        Args: { p_reason?: string; p_session_id: string }
        Returns: {
          created_at: string
          id: string
          paused_at: string
          reason: string | null
          resumed_at: string | null
          session_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_session_pauses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resume_work_session: {
        Args: { p_session_id: string }
        Returns: {
          created_at: string
          id: string
          paused_at: string
          reason: string | null
          resumed_at: string | null
          session_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_session_pauses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_schedule_block_status: {
        Args: { p_block_id: string; p_status: string }
        Returns: {
          created_at: string
          ends_at: string
          id: string
          is_locked: boolean
          source: string
          starts_at: string
          status: string
          task_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "schedule_blocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_work_session: {
        Args: { p_block_id?: string; p_task_id: string }
        Returns: {
          created_at: string
          ended_at: string | null
          id: string
          schedule_block_id: string | null
          source: string
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stop_work_session: {
        Args: {
          p_complete_task?: boolean
          p_ended_at?: string
          p_energy?: number
          p_focus?: number
          p_mood?: number
          p_note?: string
          p_session_id: string
        }
        Returns: {
          created_at: string
          ended_at: string | null
          id: string
          schedule_block_id: string | null
          source: string
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      switch_work_session: {
        Args: { p_block_id?: string; p_task_id?: string }
        Returns: {
          created_at: string
          ended_at: string | null
          id: string
          schedule_block_id: string | null
          source: string
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unschedule_block: {
        Args: { p_block_id: string }
        Returns: {
          created_at: string
          ends_at: string
          id: string
          is_locked: boolean
          source: string
          starts_at: string
          status: string
          task_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "schedule_blocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
