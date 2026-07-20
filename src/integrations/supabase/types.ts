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
      alerts: {
        Row: {
          country: string
          created_at: string
          detail: string
          headline: string
          id: string
          kind: string
          read_at: string | null
          severity: string
          signal_key: string
          supplier_name: string | null
          supplier_org_id: string | null
          user_id: string
        }
        Insert: {
          country: string
          created_at?: string
          detail: string
          headline: string
          id?: string
          kind: string
          read_at?: string | null
          severity: string
          signal_key: string
          supplier_name?: string | null
          supplier_org_id?: string | null
          user_id: string
        }
        Update: {
          country?: string
          created_at?: string
          detail?: string
          headline?: string
          id?: string
          kind?: string
          read_at?: string | null
          severity?: string
          signal_key?: string
          supplier_name?: string | null
          supplier_org_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_supplier_org_id_fkey"
            columns: ["supplier_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          meta: Json
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          target_id?: string
          target_type?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      factories: {
        Row: {
          capacity_units: number
          city: string
          country: string
          created_at: string
          id: string
          name: string
          owner_id: string
          products: string[]
          updated_at: string
          warehouse: string
        }
        Insert: {
          capacity_units?: number
          city?: string
          country?: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          products?: string[]
          updated_at?: string
          warehouse?: string
        }
        Update: {
          capacity_units?: number
          city?: string
          country?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          products?: string[]
          updated_at?: string
          warehouse?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          created_at: string
          current_stock: number
          id: string
          monthly_production: number
          name: string
          owner_id: string
          reorder_level: number
          safety_stock: number
          sku: string
          unit: string
          updated_at: string
          warehouse: string
          warehouse_capacity: number
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          current_stock?: number
          id?: string
          monthly_production?: number
          name: string
          owner_id: string
          reorder_level?: number
          safety_stock?: number
          sku: string
          unit?: string
          updated_at?: string
          warehouse?: string
          warehouse_capacity?: number
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          current_stock?: number
          id?: string
          monthly_production?: number
          name?: string
          owner_id?: string
          reorder_level?: number
          safety_stock?: number
          sku?: string
          unit?: string
          updated_at?: string
          warehouse?: string
          warehouse_capacity?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          country: string
          created_at: string
          display_name: string
          id: string
          industry: string
          name_norm: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          display_name: string
          id?: string
          industry?: string
          name_norm: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          display_name?: string
          id?: string
          industry?: string
          name_norm?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          hq_country: string
          id: string
          industry: string
          is_approved: boolean
          job_title: string
          legal_name: string
          note: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tier_role: string
          updated_at: string
          work_email: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          hq_country?: string
          id: string
          industry?: string
          is_approved?: boolean
          job_title?: string
          legal_name?: string
          note?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tier_role?: string
          updated_at?: string
          work_email?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          hq_country?: string
          id?: string
          industry?: string
          is_approved?: boolean
          job_title?: string
          legal_name?: string
          note?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tier_role?: string
          updated_at?: string
          work_email?: string
        }
        Relationships: []
      }
      supplier_watches: {
        Row: {
          created_at: string
          id: string
          supplier_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          supplier_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          supplier_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_watches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          annual_spend_bucket: string
          category: string
          created_at: string
          criticality: Database["public"]["Enums"]["criticality"]
          id: string
          is_stopped: boolean
          lead_time_days: number | null
          notes: string
          owner_id: string
          product: string
          stopped_at: string | null
          supplier_org_id: string
          updated_at: string
        }
        Insert: {
          annual_spend_bucket?: string
          category?: string
          created_at?: string
          criticality?: Database["public"]["Enums"]["criticality"]
          id?: string
          is_stopped?: boolean
          lead_time_days?: number | null
          notes?: string
          owner_id: string
          product?: string
          stopped_at?: string | null
          supplier_org_id: string
          updated_at?: string
        }
        Update: {
          annual_spend_bucket?: string
          category?: string
          created_at?: string
          criticality?: Database["public"]["Enums"]["criticality"]
          id?: string
          is_stopped?: boolean
          lead_time_days?: number | null
          notes?: string
          owner_id?: string
          product?: string
          stopped_at?: string | null
          supplier_org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_supplier_org_id_fkey"
            columns: ["supplier_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_requests: {
        Row: {
          category: string
          created_at: string
          direction: Database["public"]["Enums"]["request_direction"]
          from_org_id: string | null
          from_user_id: string
          id: string
          message: string
          product: string
          quantity: string
          responded_at: string | null
          status: Database["public"]["Enums"]["request_status"]
          to_org_id: string
          to_user_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          direction: Database["public"]["Enums"]["request_direction"]
          from_org_id?: string | null
          from_user_id: string
          id?: string
          message?: string
          product?: string
          quantity?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          to_org_id: string
          to_user_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["request_direction"]
          from_org_id?: string | null
          from_user_id?: string
          id?: string
          message?: string
          product?: string
          quantity?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          to_org_id?: string
          to_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_requests_from_org_id_fkey"
            columns: ["from_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_requests_to_org_id_fkey"
            columns: ["to_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_history: {
        Row: {
          created_at: string
          errors: Json
          filename: string
          id: string
          kind: string
          owner_id: string
          rows_failed: number
          rows_ok: number
        }
        Insert: {
          created_at?: string
          errors?: Json
          filename: string
          id?: string
          kind: string
          owner_id: string
          rows_failed?: number
          rows_ok?: number
        }
        Update: {
          created_at?: string
          errors?: Json
          filename?: string
          id?: string
          kind?: string
          owner_id?: string
          rows_failed?: number
          rows_ok?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          address: string
          capacity_units: number
          city: string
          country: string
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          address?: string
          capacity_units?: number
          city?: string
          country?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          capacity_units?: number
          city?: string
          country?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_supply_graph: {
        Args: { _user_id: string }
        Returns: {
          category: string
          criticality: Database["public"]["Enums"]["criticality"]
          parent_org_id: string
          supplier_country: string
          supplier_industry: string
          supplier_name: string
          supplier_org_id: string
          tier: number
        }[]
      }
      get_user_for_org: { Args: { _org_id: string }; Returns: string }
      list_org_products: {
        Args: { _org_id: string }
        Returns: {
          name: string
          sku: string
          unit: string
        }[]
      }
      normalize_org_name: { Args: { _name: string }; Returns: string }
      upsert_organization: {
        Args: { _country: string; _industry: string; _name: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "operator"
      criticality: "low" | "medium" | "high" | "critical"
      request_direction: "buy" | "sell"
      request_status: "pending" | "accepted" | "rejected" | "cancelled"
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
      app_role: ["admin", "operator"],
      criticality: ["low", "medium", "high", "critical"],
      request_direction: ["buy", "sell"],
      request_status: ["pending", "accepted", "rejected", "cancelled"],
    },
  },
} as const
