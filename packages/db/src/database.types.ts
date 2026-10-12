export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      images: {
        Row: {
          alt: NonNullable<Json>;
          caption: NonNullable<Json>;
          created_at: string;
          dominant_color: string | null;
          height: number | null;
          id: string;
          metadata: NonNullable<Json>;
          original_bytes: number;
          original_filename: string;
          original_key: string;
          original_mime: string;
          retired_keys: string[];
          seo_name: string;
          status: string;
          updated_at: string;
          variants: NonNullable<Json>;
          watermark: boolean;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          alt?: NonNullable<Json>;
          caption?: NonNullable<Json>;
          created_at?: string;
          dominant_color?: string | null;
          height?: number | null;
          id?: string;
          metadata?: NonNullable<Json>;
          original_bytes: number;
          original_filename: string;
          original_key: string;
          original_mime: string;
          retired_keys?: string[];
          seo_name: string;
          status?: string;
          updated_at?: string;
          variants?: NonNullable<Json>;
          watermark?: boolean;
          width?: number | null;
        };
        Update: {
          alt?: NonNullable<Json>;
          caption?: NonNullable<Json>;
          created_at?: string;
          dominant_color?: string | null;
          height?: number | null;
          id?: string;
          metadata?: NonNullable<Json>;
          original_bytes?: number;
          original_filename?: string;
          original_key?: string;
          original_mime?: string;
          retired_keys?: string[];
          seo_name?: string;
          status?: string;
          updated_at?: string;
          variants?: NonNullable<Json>;
          watermark?: boolean;
          width?: number | null;
        };
        Relationships: [];
      };
      post_images: {
        Row: {
          image_id: string;
          position: number;
          post_id: string;
          role: string;
        };
        ComputedFields: never;
        Insert: {
          image_id: string;
          position?: number;
          post_id: string;
          role: string;
        };
        Update: {
          image_id?: string;
          position?: number;
          post_id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_images_image_id_fkey';
            columns: ['image_id'];
            isOneToOne: false;
            referencedRelation: 'images';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_images_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
        ];
      };
      post_tags: {
        Row: {
          post_id: string;
          tag_id: string;
        };
        ComputedFields: never;
        Insert: {
          post_id: string;
          tag_id: string;
        };
        Update: {
          post_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_tags_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_tags_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'tags';
            referencedColumns: ['id'];
          },
        ];
      };
      posts: {
        Row: {
          body_md: string;
          cover_image_id: string | null;
          created_at: string;
          description: string;
          id: string;
          lang: string;
          previous_slugs: string[];
          published_at: string | null;
          slug: string;
          status: string;
          title: string;
          translation_key: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          body_md?: string;
          cover_image_id?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          lang: string;
          previous_slugs?: string[];
          published_at?: string | null;
          slug: string;
          status?: string;
          title?: string;
          translation_key?: string | null;
          updated_at?: string;
        };
        Update: {
          body_md?: string;
          cover_image_id?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          lang?: string;
          previous_slugs?: string[];
          published_at?: string | null;
          slug?: string;
          status?: string;
          title?: string;
          translation_key?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'posts_cover_image_id_fkey';
            columns: ['cover_image_id'];
            isOneToOne: false;
            referencedRelation: 'images';
            referencedColumns: ['id'];
          },
        ];
      };
      revisions: {
        Row: {
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          snapshot: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          snapshot: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          snapshot?: NonNullable<Json>;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          created_at: string;
          id: string;
          labels: NonNullable<Json>;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          labels?: NonNullable<Json>;
          slug: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          labels?: NonNullable<Json>;
          slug?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      set_post_tags: { Args: { p_post_id: string; p_tag_ids: string[] }; Returns: undefined };
      sync_post_images: {
        Args: { p_gallery: string[]; p_inline: string[]; p_post_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
