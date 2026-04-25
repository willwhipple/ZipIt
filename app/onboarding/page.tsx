'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Activity, CategoryType, InventorySuggestion, QuantityType } from '@/types';
import { parseAboutMe, formatAboutMe } from '@/lib/aboutMe';
import { generatePackingList } from '@/lib/generation';
import SuitcaseIcon from '@/components/SuitcaseIcon';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { PrimaryBtn, SecondaryBtn } from '@/components/ui/Button';

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: CategoryType[] = ['Clothing', 'Shoes', 'Toiletries', 'Accessories', 'Equipment'];
const QUANTITY_TYPES: { value: QuantityType; label: string; description: string }[] = [
  { value: 'fixed', label: 'Fixed', description: 'Always bring exactly 1' },
  { value: 'per_night', label: 'Per Night', description: 'Scales with trip duration' },
  { value: 'per_activity', label: 'Per Activity', description: 'Scales with matching activities' },
];

const SLIDES = [
  {
    emoji: '⚡',
    heading: "Tell us your trip. We'll build your list.",
    body: 'Quick setup, curated templates, personalised by AI.',
  },
  {
    emoji: '🏷️',
    heading: 'Your list = essentials + activity gear',
    body: "Items tagged to an activity only appear when that activity is on your trip. We'll show you how.",
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type OnboardingPath = 'trip' | 'setup' | null;
type Step = 'walkthrough' | 'path-choice' | 'trip-form' | 'about-me' | 'activities' | 'import' | 'loading' | 'review';
type ImportTab = 'upload' | 'paste';

// ── Main component (wrapped in Suspense for useSearchParams) ─────────────────

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRedo = searchParams.get('redo') === 'true';
  const generationRan = useRef(false);

  const supabase = createClient();

  // Step machine
  const [step, setStep] = useState<Step>(isRedo ? 'path-choice' : 'walkthrough');
  const [slideIndex, setSlideIndex] = useState(0);
  const [path, setPath] = useState<OnboardingPath>(null);

  // Fetched on mount
  const [userId, setUserId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [prefsId, setPrefsId] = useState<string | null>(null);
  const [initDone, setInitDone] = useState(false);

  // Structured About Me (shared between about-me step and settings)
  const [toiletriesAndMeds, setToiletriesAndMeds] = useState('');
  const [neverWithout, setNeverWithout] = useState('');

  // Path A — trip form
  const [tripName, setTripName] = useState('');
  const [tripDestination, setTripDestination] = useState('');
  const [tripStartDate, setTripStartDate] = useState('');
  const [tripNights, setTripNights] = useState('1');
  const [tripActivityNames, setTripActivityNames] = useState<string[]>([]);
  const [tripFormError, setTripFormError] = useState('');

  // Path B — activities step
  const [selectedActivityNames, setSelectedActivityNames] = useState<string[]>([]);
  const [newActivityInput, setNewActivityInput] = useState('');
  const [addingActivity, setAddingActivity] = useState(false);

  // Import
  const [importTab, setImportTab] = useState<ImportTab>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importedItems, setImportedItems] = useState<InventorySuggestion[]>([]);

  // Loading / generation
  const [loadError, setLoadError] = useState<string | null>(null);

  // Review
  const [reviewItems, setReviewItems] = useState<InventorySuggestion[]>([]);
  const [checkedNames, setCheckedNames] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<InventorySuggestion | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<CategoryType>('Clothing');
  const [editQty, setEditQty] = useState<QuantityType>('fixed');
  const [editActivities, setEditActivities] = useState<string[]>([]);
  const [editIsEssential, setEditIsEssential] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const [actsResult, prefsResult] = await Promise.all([
        supabase.from('activities').select('*').order('name'),
        supabase.from('user_preferences').select('id, about_me, onboarding_completed').limit(1).maybeSingle(),
      ]);

      // If user has no activities (pre-trigger signup), seed the defaults now
      if (actsResult.data && actsResult.data.length === 0 && user?.id) {
        const defaults = ['Golf', 'Beach', 'Business', 'Hiking', 'Formal Dinner', 'Casual', 'Ski', 'City Sightseeing'];
        const { data: seeded } = await supabase
          .from('activities')
          .insert(defaults.map((name) => ({ name, user_id: user.id })))
          .select('id, name, user_id, created_at');
        if (seeded) setActivities(seeded as Activity[]);
      } else if (actsResult.data) {
        setActivities(actsResult.data as Activity[]);
      }

      if (prefsResult.data) {
        setPrefsId(prefsResult.data.id);
        const parsed = parseAboutMe(prefsResult.data.about_me ?? null);
        setToiletriesAndMeds(parsed.toiletriesAndMeds);
        setNeverWithout(parsed.neverWithout);

        if (prefsResult.data.onboarding_completed && !isRedo) {
          router.replace('/');
          return;
        }
      }

      setInitDone(true);
    }
    load();
  }, []);

  // Trigger AI generation exactly once when loading step is reached
  useEffect(() => {
    if (step === 'loading' && !generationRan.current) {
      generationRan.current = true;
      runGeneration();
    }
  }, [step]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function resolveActivityIds(names: string[]): string[] {
    return names
      .map((n) => activities.find((a) => a.name === n)?.id)
      .filter((id): id is string => !!id);
  }

  async function saveAboutMe(text: string) {
    const trimmed = text.trim() || null;
    if (prefsId) {
      await supabase.from('user_preferences').update({ about_me: trimmed }).eq('id', prefsId);
    }
  }

  async function addActivity() {
    const name = newActivityInput.trim();
    if (!name || activities.some((a) => a.name.toLowerCase() === name.toLowerCase())) return;
    setAddingActivity(true);
    const { data, error } = await supabase
      .from('activities')
      .insert({ name, user_id: userId })
      .select('id, name, user_id, created_at')
      .single();
    if (!error && data) {
      setActivities((prev) => [...prev, data as Activity]);
      setSelectedActivityNames((prev) => [...prev, data.name]);
    }
    setNewActivityInput('');
    setAddingActivity(false);
  }

  async function markComplete() {
    if (prefsId) {
      await supabase.from('user_preferences').update({ onboarding_completed: true }).eq('id', prefsId);
    } else {
      await supabase.from('user_preferences').insert({ onboarding_completed: true });
    }
  }

  async function skip() {
    await markComplete();
    router.push('/inventory');
  }

  // ── AI generation ──────────────────────────────────────────────────────────

  async function runGeneration() {
    const activityNames = path === 'trip' ? tripActivityNames : selectedActivityNames;

    // Pull curated items from system_items — essential ones always included, activity-tagged ones filtered by selection
    const { data: sysItems } = await supabase.from('system_items').select('*');
    const relevant = (sysItems ?? []).filter((item) =>
      item.essential || item.activity_names.some((n: string) => activityNames.includes(n))
    );
    const templateItems: InventorySuggestion[] = relevant.map((item) => ({
      name: item.name,
      category: item.category as CategoryType,
      quantityType: item.quantity_type as QuantityType,
      reason: '',
      activities: item.activity_names as string[],
    }));

    const combinedItems = dedupByName([...templateItems, ...importedItems]);
    const aboutMeText = formatAboutMe({ toiletriesAndMeds, neverWithout });
    const activitySet = new Set(activityNames);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suggest_inventory_items',
          aboutMe: aboutMeText || undefined,
          activityNames: activityNames.length > 0 ? activityNames : activities.map((a) => a.name),
          existingItemNames: combinedItems.map((i) => i.name),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error();
      const aiItems: InventorySuggestion[] = data.suggestions ?? [];
      const finalItems = dedupByName([...combinedItems, ...aiItems]).filter((item) =>
        item.activities.length === 0 || item.activities.some((a) => activitySet.has(a))
      );
      setReviewItems(finalItems);
      setCheckedNames(new Set(finalItems.map((i) => i.name)));
    } catch {
      const fallback = combinedItems.filter((item) =>
        item.activities.length === 0 || item.activities.some((a) => activitySet.has(a))
      );
      setReviewItems(fallback);
      setCheckedNames(new Set(fallback.map((i) => i.name)));
      setLoadError('AI suggestions unavailable — showing curated list.');
    }
    setStep('review');
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleParseFile() {
    if (!selectedFile) return;
    setImportLoading(true);
    setImportError('');
    try {
      const isText = selectedFile.type === 'text/plain' || selectedFile.name.endsWith('.md');
      if (isText) {
        await parseContent({ text: await selectedFile.text() });
      } else {
        const base64 = await fileToBase64(selectedFile);
        await parseContent({ fileData: base64, mimeType: selectedFile.type || 'application/octet-stream' });
      }
    } catch {
      setImportError("Couldn't read the file. Try pasting the text instead.");
    } finally {
      setImportLoading(false);
    }
  }

  async function handlePasteText() {
    if (!pasteText.trim()) return;
    setImportLoading(true);
    setImportError('');
    await parseContent({ text: pasteText.trim() });
    setImportLoading(false);
  }

  async function parseContent(payload: { text?: string; fileData?: string; mimeType?: string }) {
    const activityNames = path === 'trip' ? tripActivityNames : selectedActivityNames;
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'parse_packing_list',
        activityNames: activityNames.length > 0 ? activityNames : activities.map((a) => a.name),
        ...payload,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      setImportError("Couldn't parse the list. Try pasting the text instead.");
    } else {
      const items: InventorySuggestion[] = data.suggestions ?? [];
      setImportedItems(items);
      setStep('loading');
    }
  }

  // ── Review ─────────────────────────────────────────────────────────────────

  function openEdit(s: InventorySuggestion) {
    setEditingItem(s);
    setEditName(s.name);
    setEditCategory(s.category);
    setEditQty(s.quantityType);
    setEditActivities(s.activities);
    setEditIsEssential(s.activities.length === 0);
  }

  function saveEdit() {
    if (!editingItem || !editName.trim()) return;
    const newActivities = editIsEssential ? [] : editActivities;
    const updated: InventorySuggestion = { ...editingItem, name: editName.trim(), category: editCategory, quantityType: editQty, activities: newActivities };
    setReviewItems((prev) => prev.map((s) => (s.name === editingItem.name ? updated : s)));
    setCheckedNames((prev) => {
      const next = new Set(prev);
      next.delete(editingItem.name);
      next.add(updated.name);
      return next;
    });
    setEditingItem(null);
  }

  async function confirmItems() {
    setConfirming(true);
    const toInsert = reviewItems.filter((s) => checkedNames.has(s.name));

    for (const item of toInsert) {
      const { data: newItem, error } = await supabase
        .from('items')
        .insert({ name: item.name, category: item.category, quantity_type: item.quantityType, essential: item.activities.length === 0, user_id: userId })
        .select('id')
        .single();

      if (!error && newItem) {
        const activityIds = resolveActivityIds(item.activities);
        if (activityIds.length > 0) {
          await supabase.from('item_activities').insert(
            activityIds.map((activity_id) => ({ item_id: newItem.id, activity_id }))
          );
        }
      }
    }

    if (path === 'trip') {
      const nights = Math.max(1, parseInt(tripNights, 10) || 1);
      const endDate = computeEndDate(tripStartDate, nights);

      const { data: newTrip } = await supabase
        .from('trips')
        .insert({ name: tripName, destination: tripDestination || null, start_date: tripStartDate, end_date: endDate, user_id: userId })
        .select('id')
        .single();

      if (newTrip) {
        const tripActivityIds = resolveActivityIds(tripActivityNames);
        if (tripActivityIds.length > 0) {
          await supabase.from('trip_activities').insert(
            tripActivityIds.map((activity_id) => ({ trip_id: newTrip.id, activity_id }))
          );
        }
        await generatePackingList(supabase, newTrip.id);
        await markComplete();
        router.push(`/trip/${newTrip.id}`);
        return;
      }
    }

    await markComplete();
    router.push('/inventory');
  }

  const checkedCount = reviewItems.filter((s) => checkedNames.has(s.name)).length;

  // ── Loading state ─────────────────────────────────────────────────────────

  if (!initDone) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-white">
        <SuitcaseIcon size={32} className="luggage-spin-icon" style={{ color: 'var(--zi-brand)' }} />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh flex flex-col bg-white">

      {/* ── Walkthrough ─────────────────────────────────────────────────────── */}
      {step === 'walkthrough' && (
        <div className="flex-1 flex flex-col">
          <div className="flex justify-end px-5 pt-5 pb-0">
            <button onClick={() => setStep('path-choice')} className="text-sm font-medium" style={{ color: 'var(--zi-text-subtle)' }}>
              Skip
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6">
            <div
              className="flex items-center justify-center"
              style={{ width: 80, height: 80, borderRadius: 24, background: 'var(--zi-brand-tint)', fontSize: 40 }}
            >
              {SLIDES[slideIndex].emoji}
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold" style={{ color: 'var(--zi-brand)' }}>
                {SLIDES[slideIndex].heading}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--zi-text-muted)' }}>
                {SLIDES[slideIndex].body}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-6 px-6 pb-10">
            <div className="flex gap-2">
              {SLIDES.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === slideIndex ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: i === slideIndex ? 'var(--zi-brand)' : 'var(--zi-border-strong)',
                    transition: 'width 0.2s ease, background 0.2s ease',
                  }}
                />
              ))}
            </div>

            <div className="flex items-center justify-between w-full">
              <button
                onClick={() => slideIndex > 0 && setSlideIndex(slideIndex - 1)}
                className="text-sm font-medium px-4 py-2"
                style={{ color: slideIndex > 0 ? 'var(--zi-brand)' : 'transparent' }}
              >
                Back
              </button>

              <PrimaryBtn
                onClick={() => {
                  if (slideIndex < SLIDES.length - 1) {
                    setSlideIndex(slideIndex + 1);
                  } else {
                    setStep('path-choice');
                  }
                }}
              >
                {slideIndex === SLIDES.length - 1 ? 'Get started →' : 'Next'}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* ── Path Choice ─────────────────────────────────────────────────────── */}
      {step === 'path-choice' && (
        <div className="flex-1 flex flex-col px-6 pt-10 pb-10 gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold" style={{ color: 'var(--zi-brand)' }}>Let&apos;s get you set up</h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--zi-text-muted)' }}>
              What would you like to do first?
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => { setPath('trip'); setStep('trip-form'); }}
              className="text-left p-5"
              style={{ border: '1.5px solid var(--zi-brand)', borderRadius: 'var(--zi-r-lg)', background: 'var(--zi-brand-tint)' }}
            >
              <p className="text-base font-semibold mb-1.5" style={{ color: 'var(--zi-brand)' }}>
                🧳 Packing for a trip right now?
              </p>
              <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
                Tell us where you&apos;re headed and we&apos;ll build your list in 30 seconds.
              </p>
            </button>

            <button
              onClick={() => { setPath('setup'); setStep('about-me'); }}
              className="text-left p-5"
              style={{ border: '1.5px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
            >
              <p className="text-base font-semibold mb-1.5" style={{ color: 'var(--zi-text)' }}>
                📋 Just setting up
              </p>
              <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
                Build your My Stuff list now and create trips whenever you&apos;re ready.
              </p>
            </button>
          </div>

          <div className="flex-1" />

          <button onClick={skip} className="text-sm font-medium py-2 text-center" style={{ color: 'var(--zi-text-subtle)' }}>
            Skip for now
          </button>
        </div>
      )}

      {/* ── Trip Form (Path A) ──────────────────────────────────────────────── */}
      {step === 'trip-form' && (
        <div className="flex-1 flex flex-col px-6 pt-8 pb-10 gap-5">
          <button onClick={() => setStep('path-choice')} className="text-sm font-medium self-start" style={{ color: 'var(--zi-brand)' }}>
            ← Back
          </button>

          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold" style={{ color: 'var(--zi-brand)' }}>Tell us about your trip</h2>
            <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>We&apos;ll use this to build a tailored packing list.</p>
          </div>

          <div className="flex flex-col gap-4 flex-1">
            <Input
              label="Trip name"
              value={tripName}
              onChange={setTripName}
              placeholder="e.g. Lisbon with Mia"
            />
            <Input
              label="Destination (optional)"
              value={tripDestination}
              onChange={setTripDestination}
              placeholder="e.g. Lisbon, Portugal"
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[13px] font-medium mb-1.5" style={{ color: 'var(--zi-text)' }}>Start date</p>
                <input
                  type="date"
                  value={tripStartDate}
                  onChange={(e) => setTripStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm outline-none"
                  style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
                />
              </div>
              <div style={{ width: 90 }}>
                <p className="text-[13px] font-medium mb-1.5" style={{ color: 'var(--zi-text)' }}>Nights</p>
                <input
                  type="number"
                  min={1}
                  value={tripNights}
                  onChange={(e) => setTripNights(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm outline-none text-center"
                  style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
                />
              </div>
            </div>

            <div>
              <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Activities</p>
              <div className="flex flex-wrap gap-2">
                {activities.map((a) => {
                  const selected = tripActivityNames.includes(a.name);
                  return (
                    <Chip
                      key={a.id}
                      selected={selected}
                      onClick={() =>
                        setTripActivityNames((prev) =>
                          selected ? prev.filter((n) => n !== a.name) : [...prev, a.name]
                        )
                      }
                    >
                      {a.name}
                    </Chip>
                  );
                })}
              </div>
            </div>

            {tripFormError && <p className="text-xs" style={{ color: 'var(--zi-danger)' }}>{tripFormError}</p>}
          </div>

          <PrimaryBtn
            onClick={() => {
              if (!tripName.trim()) return setTripFormError('Please enter a trip name.');
              if (!tripStartDate) return setTripFormError('Please enter a start date.');
              setTripFormError('');
              setStep('about-me');
            }}
            full
          >
            Next →
          </PrimaryBtn>
        </div>
      )}

      {/* ── About Me (both paths) ───────────────────────────────────────────── */}
      {step === 'about-me' && (
        <div className="flex-1 flex flex-col px-6 pt-8 pb-10 gap-5">
          <button
            onClick={() => setStep(path === 'trip' ? 'trip-form' : 'path-choice')}
            className="text-sm font-medium self-start"
            style={{ color: 'var(--zi-brand)' }}
          >
            ← Back
          </button>

          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold" style={{ color: 'var(--zi-brand)' }}>A little about you</h2>
            <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
              Helps us personalise your list. You can edit this any time in Settings.
            </p>
          </div>

          <div className="flex flex-col gap-4 flex-1">
            <div>
              <p className="text-[13px] font-medium mb-1.5" style={{ color: 'var(--zi-text)' }}>Toiletries & medications</p>
              <textarea
                value={toiletriesAndMeds}
                onChange={(e) => setToiletriesAndMeds(e.target.value)}
                placeholder="e.g. Nivea moisturiser, electric toothbrush, antihistamines"
                rows={2}
                className="w-full px-3 py-2.5 text-sm resize-none outline-none"
                style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
              />
            </div>
            <div>
              <p className="text-[13px] font-medium mb-1.5" style={{ color: 'var(--zi-text)' }}>
                What are some things you never travel without?{' '}
                <span style={{ color: 'var(--zi-text-subtle)', fontWeight: 400 }}>— optional</span>
              </p>
              <textarea
                value={neverWithout}
                onChange={(e) => setNeverWithout(e.target.value)}
                placeholder="e.g. noise-cancelling headphones, travel pillow"
                rows={2}
                className="w-full px-3 py-2.5 text-sm resize-none outline-none"
                style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <PrimaryBtn
              onClick={async () => {
                await saveAboutMe(formatAboutMe({ toiletriesAndMeds, neverWithout }));
                setStep(path === 'trip' ? 'import' : 'activities');
              }}
              full
            >
              Next →
            </PrimaryBtn>
            <button
              onClick={() => setStep(path === 'trip' ? 'import' : 'activities')}
              className="text-sm font-medium py-2 text-center"
              style={{ color: 'var(--zi-text-subtle)' }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ── Activities (Path B only) ─────────────────────────────────────────── */}
      {step === 'activities' && (
        <div className="flex-1 flex flex-col px-6 pt-8 pb-10 gap-5">
          <button onClick={() => setStep('about-me')} className="text-sm font-medium self-start" style={{ color: 'var(--zi-brand)' }}>
            ← Back
          </button>

          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold" style={{ color: 'var(--zi-brand)' }}>What do you pack for?</h2>
            <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
              Select the activities that apply to your trips.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {activities.map((a) => {
              const selected = selectedActivityNames.includes(a.name);
              return (
                <Chip
                  key={a.id}
                  selected={selected}
                  onClick={() =>
                    setSelectedActivityNames((prev) =>
                      selected ? prev.filter((n) => n !== a.name) : [...prev, a.name]
                    )
                  }
                >
                  {a.name}
                </Chip>
              );
            })}
          </div>

          <div className="flex gap-2">
            <input
              value={newActivityInput}
              onChange={(e) => setNewActivityInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addActivity()}
              placeholder="Add your own…"
              className="flex-1 px-3 py-2 text-sm outline-none"
              style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
            />
            <button
              onClick={addActivity}
              disabled={!newActivityInput.trim() || addingActivity}
              className="px-4 py-2 text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--zi-brand)', color: '#fff', borderRadius: 'var(--zi-r-lg)', border: 'none' }}
            >
              Add
            </button>
          </div>

          <div className="flex-1" />

          <div className="flex flex-col gap-3">
            <PrimaryBtn onClick={() => setStep('import')} full>
              Next →
            </PrimaryBtn>
            <button
              onClick={() => setStep('import')}
              className="text-sm font-medium py-2 text-center"
              style={{ color: 'var(--zi-text-subtle)' }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ── Import (both paths — optional) ──────────────────────────────────── */}
      {step === 'import' && (
        <div className="flex-1 flex flex-col px-6 pt-8 pb-10 gap-5">
          <button
            onClick={() => setStep(path === 'trip' ? 'about-me' : 'activities')}
            className="text-sm font-medium self-start"
            style={{ color: 'var(--zi-brand)' }}
          >
            ← Back
          </button>

          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold" style={{ color: 'var(--zi-brand)' }}>Got a list you&apos;ve used before?</h2>
            <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>
              Paste it or upload a photo/PDF — we&apos;ll fold it into your suggestions.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex" style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)', padding: 3 }}>
            {(['upload', 'paste'] as ImportTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setImportTab(tab)}
                className="flex-1 py-2 text-sm font-medium"
                style={{
                  borderRadius: 'calc(var(--zi-r-lg) - 3px)',
                  background: importTab === tab ? 'var(--zi-brand)' : 'transparent',
                  color: importTab === tab ? '#fff' : 'var(--zi-text-muted)',
                }}
              >
                {tab === 'upload' ? 'Upload file' : 'Paste text'}
              </button>
            ))}
          </div>

          {importTab === 'upload' && (
            <div className="flex flex-col gap-4 flex-1">
              <label
                className="flex flex-col items-center justify-center gap-3 py-10 cursor-pointer"
                style={{ border: '1.5px dashed var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
              >
                <svg width="28" height="28" fill="none" stroke="var(--zi-text-subtle)" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>
                    {selectedFile ? selectedFile.name : 'Tap to choose a file'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>Photo, PDF, or text file</p>
                </div>
                <input
                  type="file"
                  accept="image/*,.pdf,.txt,.md"
                  className="hidden"
                  onChange={(e) => { setSelectedFile(e.target.files?.[0] ?? null); setImportError(''); }}
                />
              </label>
              {importError && <p className="text-xs" style={{ color: 'var(--zi-danger)' }}>{importError}</p>}
              <div className="flex-1" />
              {importLoading ? (
                <div className="flex items-center gap-2 justify-center py-4">
                  <SuitcaseIcon size={20} className="luggage-spin-icon" style={{ color: 'var(--zi-brand)' }} />
                  <span className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>Parsing…</span>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <PrimaryBtn onClick={handleParseFile} disabled={!selectedFile} full>Add list</PrimaryBtn>
                  <SecondaryBtn onClick={() => setStep('loading')} full>Skip</SecondaryBtn>
                </div>
              )}
            </div>
          )}

          {importTab === 'paste' && (
            <div className="flex flex-col gap-4 flex-1">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste your packing list here — any format works"
                rows={8}
                className="w-full px-3 py-2.5 text-sm resize-none outline-none"
                style={{ border: '1px solid var(--zi-border-strong)', borderRadius: 'var(--zi-r-lg)' }}
              />
              {importError && <p className="text-xs" style={{ color: 'var(--zi-danger)' }}>{importError}</p>}
              <div className="flex-1" />
              {importLoading ? (
                <div className="flex items-center gap-2 justify-center py-4">
                  <SuitcaseIcon size={20} className="luggage-spin-icon" style={{ color: 'var(--zi-brand)' }} />
                  <span className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>Parsing…</span>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <PrimaryBtn onClick={handlePasteText} disabled={!pasteText.trim()} full>Add list</PrimaryBtn>
                  <SecondaryBtn onClick={() => setStep('loading')} full>Skip</SecondaryBtn>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Loading / Generation ─────────────────────────────────────────────── */}
      {step === 'loading' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <SuitcaseIcon size={40} className="luggage-spin-icon" style={{ color: 'var(--zi-brand)' }} />
          <p className="text-sm" style={{ color: 'var(--zi-text-muted)' }}>Building your list…</p>
        </div>
      )}

      {/* ── Review ──────────────────────────────────────────────────────────── */}
      {step === 'review' && (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--zi-border)' }}>
            <h2 className="text-xl font-bold" style={{ color: 'var(--zi-brand)' }}>
              {editingItem ? 'Edit item' : 'Review items'}
            </h2>
            {!editingItem && (
              <button onClick={skip} className="text-sm font-medium" style={{ color: 'var(--zi-text-subtle)' }}>
                Skip
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
            {editingItem ? (
              <div className="flex flex-col gap-4">
                <button onClick={() => setEditingItem(null)} className="text-sm font-medium self-start" style={{ color: 'var(--zi-brand)' }}>
                  ← Back to items
                </button>
                <Input label="Name" value={editName} onChange={setEditName} />
                <div>
                  <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Category</p>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => (
                      <Chip key={cat} selected={editCategory === cat} onClick={() => setEditCategory(cat)}>{cat}</Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Quantity</p>
                  <div className="flex flex-col gap-2">
                    {QUANTITY_TYPES.map(({ value, label, description }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setEditQty(value)}
                        className="flex items-start gap-3 px-3 py-3 text-left"
                        style={{
                          borderRadius: 'var(--zi-r-lg)',
                          border: `1px solid ${editQty === value ? 'var(--zi-brand)' : 'var(--zi-border-strong)'}`,
                          background: editQty === value ? 'var(--zi-brand-tint)' : 'transparent',
                        }}
                      >
                        <div
                          className="mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                          style={{ borderColor: editQty === value ? 'var(--zi-brand)' : 'var(--zi-border-strong)' }}
                        >
                          {editQty === value && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--zi-brand)' }} />}
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>{label}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>{description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--zi-text)' }}>Role</p>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !editIsEssential;
                      setEditIsEssential(next);
                      if (next) setEditActivities([]);
                    }}
                    className="flex items-center gap-3 w-full px-4 py-3 mb-3"
                    style={{
                      borderRadius: 'var(--zi-r-lg)',
                      border: `1px solid ${editIsEssential ? '#16a34a' : 'var(--zi-border-strong)'}`,
                      background: editIsEssential ? '#dcfce7' : 'transparent',
                    }}
                  >
                    <div className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                      style={{ borderColor: editIsEssential ? '#16a34a' : 'var(--zi-border-strong)' }}>
                      {editIsEssential && <div className="w-2 h-2 rounded-full" style={{ background: '#16a34a' }} />}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>Essential</p>
                      <p className="text-xs" style={{ color: 'var(--zi-text-subtle)' }}>Always packed on every trip</p>
                    </div>
                  </button>

                  <div className="mt-1">
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--zi-text-subtle)' }}>Tagged activities</p>
                    <div className="flex flex-wrap gap-2">
                      {activities.map((a) => {
                        const sel = editActivities.includes(a.name);
                        return (
                          <Chip key={a.id} selected={sel} onClick={() => {
                            setEditIsEssential(false);
                            setEditActivities((prev) => sel ? prev.filter((n) => n !== a.name) : [...prev, a.name]);
                          }}>{a.name}</Chip>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <PrimaryBtn onClick={saveEdit} disabled={!editName.trim()} full>Save</PrimaryBtn>
              </div>
            ) : (
              <>
                {loadError && (
                  <div className="px-3 py-2 rounded-lg text-xs" style={{ background: '#fef3c7', color: '#92400e' }}>
                    {loadError}
                  </div>
                )}
                <p className="text-xs" style={{ color: 'var(--zi-text-subtle)' }}>
                  All items are saved by default — uncheck anything you don&apos;t want.
                </p>

                {(() => {
                  const essentialItems = reviewItems.filter((s) => s.activities.length === 0);
                  const reviewActivityNames = path === 'trip' ? tripActivityNames : selectedActivityNames;
                  const activitySections = reviewActivityNames
                    .map((name) => ({ name, items: reviewItems.filter((s) => s.activities.includes(name)) }))
                    .filter((section) => section.items.length > 0);

                  const renderItem = (s: InventorySuggestion) => {
                    const checked = checkedNames.has(s.name);
                    return (
                      <div key={s.name} className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--zi-border)' }}>
                        <button
                          onClick={() => setCheckedNames((prev) => {
                            const next = new Set(prev);
                            checked ? next.delete(s.name) : next.add(s.name);
                            return next;
                          })}
                          className="mt-0.5 flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
                          style={{
                            border: `2px solid ${checked ? 'var(--zi-brand)' : 'var(--zi-border-strong)'}`,
                            background: checked ? 'var(--zi-brand)' : 'white',
                          }}
                        >
                          {checked && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <button onClick={() => openEdit(s)} className="text-left w-full">
                            <p className="text-sm font-medium" style={{ color: 'var(--zi-text)' }}>{s.name}</p>
                          </button>
                          <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--zi-text-subtle)' }}>
                            {s.category} · {s.quantityType.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                    );
                  };

                  const renderSection = (isEssentials: boolean, name: string, items: InventorySuggestion[], key: string) => (
                    <div key={key}>
                      <div className="pt-5 pb-2">
                        <p className="text-xs font-semibold"
                          style={{ color: isEssentials ? 'var(--zi-success)' : 'var(--zi-brand)' }}>
                          {isEssentials ? 'Essentials' : `${name} gear`}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--zi-text-subtle)' }}>
                          {isEssentials ? 'Always packed on every trip' : `Only packed when ${name} is on your trip`}
                        </p>
                      </div>
                      <div style={{ borderTop: '1px solid var(--zi-border)' }}>
                        {items.map(renderItem)}
                      </div>
                    </div>
                  );

                  return (
                    <>
                      {essentialItems.length > 0 && renderSection(true, 'Essentials', essentialItems, 'essentials')}
                      {activitySections.map((section) =>
                        renderSection(false, section.name, section.items, section.name)
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>

          {!editingItem && (
            <div className="px-6 py-5 flex flex-col gap-3" style={{ borderTop: '1px solid var(--zi-border)' }}>
              <PrimaryBtn onClick={confirmItems} disabled={confirming || checkedCount === 0} full>
                {confirming
                  ? 'Setting up…'
                  : path === 'trip'
                    ? `Let's go → (${checkedCount} item${checkedCount !== 1 ? 's' : ''})`
                    : `Build My Stuff → (${checkedCount} item${checkedCount !== 1 ? 's' : ''})`
                }
              </PrimaryBtn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page export (Suspense required for useSearchParams) ───────────────────────

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function dedupByName(items: InventorySuggestion[]): InventorySuggestion[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function computeEndDate(startDate: string, nights: number): string {
  const d = new Date(startDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + nights);
  return d.toISOString().slice(0, 10);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URI prefix (e.g. "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
