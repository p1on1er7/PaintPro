-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- LOGISTICA
CREATE TABLE public.logistica_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('attrezzatura','colori','spesa','storico')),
  name TEXT NOT NULL,
  quantity NUMERIC DEFAULT 1,
  unit TEXT,
  price NUMERIC,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.logistica_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own logistica select" ON public.logistica_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own logistica insert" ON public.logistica_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own logistica update" ON public.logistica_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Own logistica delete" ON public.logistica_items FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER logistica_updated_at BEFORE UPDATE ON public.logistica_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_logistica_user_cat ON public.logistica_items(user_id, category);

-- PREVENTIVI
CREATE TABLE public.preventivi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente TEXT NOT NULL,
  ragione_sociale TEXT,
  luogo TEXT,
  data_lavoro DATE,
  ora TEXT,
  note TEXT,
  voci JSONB NOT NULL DEFAULT '[]'::jsonb,
  totale NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.preventivi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own preventivi select" ON public.preventivi FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own preventivi insert" ON public.preventivi FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own preventivi update" ON public.preventivi FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Own preventivi delete" ON public.preventivi FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER preventivi_updated_at BEFORE UPDATE ON public.preventivi FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_preventivi_user ON public.preventivi(user_id, created_at DESC);

-- EVENTI
CREATE TABLE public.eventi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titolo TEXT NOT NULL,
  descrizione TEXT,
  data_inizio TIMESTAMPTZ NOT NULL,
  data_fine TIMESTAMPTZ,
  luogo TEXT,
  cliente TEXT,
  tipo TEXT DEFAULT 'lavoro',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.eventi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own eventi select" ON public.eventi FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own eventi insert" ON public.eventi FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own eventi update" ON public.eventi FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Own eventi delete" ON public.eventi FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER eventi_updated_at BEFORE UPDATE ON public.eventi FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_eventi_user_data ON public.eventi(user_id, data_inizio);

-- CHAT MESSAGES
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own chat select" ON public.chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own chat insert" ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own chat delete" ON public.chat_messages FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_chat_user_created ON public.chat_messages(user_id, created_at);

-- GENERATED IMAGES
CREATE TABLE public.generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url TEXT,
  result_url TEXT NOT NULL,
  prompt TEXT NOT NULL,
  color_code TEXT,
  zone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.generated_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own images select" ON public.generated_images FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own images insert" ON public.generated_images FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own images delete" ON public.generated_images FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_images_user ON public.generated_images(user_id, created_at DESC);

-- STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public) VALUES ('paintpro', 'paintpro', true);

CREATE POLICY "Own files read" ON storage.objects FOR SELECT
USING (bucket_id = 'paintpro' AND (auth.uid()::text = (storage.foldername(name))[1] OR true));
CREATE POLICY "Own files insert" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'paintpro' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Own files update" ON storage.objects FOR UPDATE
USING (bucket_id = 'paintpro' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Own files delete" ON storage.objects FOR DELETE
USING (bucket_id = 'paintpro' AND auth.uid()::text = (storage.foldername(name))[1]);