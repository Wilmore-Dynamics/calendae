export const API_BASE = '';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || `Request failed (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Auth ──

export interface User {
  id: string;
  email: string;
  slug: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  company_id: string | null;
  role: string;
  phone: string | null;
  avatar_url: string | null;
  timezone: string;
  reminder_sms: boolean;
  reminder_email: boolean;
  reminder_minutes: number;
  max_bookings_per_day: number;
  google_calendar_sync_enabled: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export async function register(email: string, password: string, display_name?: string): Promise<TokenResponse> {
  return request<TokenResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name }),
  });
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  return request<TokenResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function refreshToken(refresh_token: string): Promise<TokenResponse> {
  return request<TokenResponse>('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token }),
  });
}

export async function getMe(): Promise<User> {
  return request<User>('/api/auth/me');
}

export interface UserSettings {
  display_name?: string;
  phone?: string;
  avatar_url?: string;
  timezone?: string;
  reminder_sms?: boolean;
  reminder_email?: boolean;
  reminder_minutes?: number;
  max_bookings_per_day?: number;
  password?: string;
}

export async function updateMe(settings: UserSettings): Promise<User> {
  return request<User>('/api/auth/me', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// ── Events ──

export interface CalendaeEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  rrule: string | null;
  user_id: string;
  company_id: string | null;
  visibility: string;
}

export interface EventInput {
  title: string;
  start_time: string;
  end_time: string;
  rrule?: string | null;
}

export async function createEvent(event: EventInput): Promise<CalendaeEvent> {
  return request<CalendaeEvent>('/api/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

export async function listEvents(start?: string, end?: string): Promise<CalendaeEvent[]> {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  const qs = params.toString();
  return request<CalendaeEvent[]>(`/api/events${qs ? '?' + qs : ''}`);
}

export async function updateEvent(id: string, event: EventInput): Promise<CalendaeEvent> {
  return request<CalendaeEvent>(`/api/events/${id}`, {
    method: 'PUT',
    body: JSON.stringify(event),
  });
}

export async function deleteEvent(id: string): Promise<void> {
  return request<void>(`/api/events/${id}`, { method: 'DELETE' });
}

// ── Company ──

export interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string | null;
  custom_domain: string | null;
  webhook_url: string | null;
  stripe_publishable_key: string | null;
  stripe_secret_key: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password: string | null;
  created_at: string;
}

export async function createCompany(name: string, slug: string): Promise<Company> {
  return request<Company>('/api/companies', {
    method: 'POST',
    body: JSON.stringify({ name, slug }),
  });
}

export async function getCompany(): Promise<Company> {
  return request<Company>('/api/companies/me');
}

export interface CompanySettings {
  name?: string;
  slug?: string;
  logo_url?: string;
  brand_color?: string;
  custom_domain?: string;
  webhook_url?: string;
  stripe_publishable_key?: string;
  stripe_secret_key?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_password?: string;
}

export async function updateCompany(settings: CompanySettings): Promise<Company> {
  return request<Company>('/api/companies/me', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export interface Member {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export async function inviteMember(email: string, role: string = 'collaborator'): Promise<void> {
  return request<void>('/api/companies/invite', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

export async function listMembers(): Promise<Member[]> {
  return request<Member[]>('/api/companies/members');
}

export async function updateMemberRole(memberId: string, role: string): Promise<Member> {
  return request<Member>(`/api/companies/members/${memberId}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}

export async function removeMember(memberId: string): Promise<void> {
  return request<void>(`/api/companies/members/${memberId}`, { method: 'DELETE' });
}

// ── Event Types ──

export interface EventType {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  color: string | null;
  is_active: boolean;
  company_id: string;
  created_by: string;
  created_at: string;
  buffer_before: number;
  buffer_after: number;
  min_notice_minutes: number;
  max_bookings_per_day: number;
  assignment_type: string;
  price_amount: number | null;
  price_currency: string;
  slot_interval: number | null;
  custom_fields?: FieldDef[];
}

export interface FieldDef {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "phone" | "number";
  options?: string[];
  required?: boolean;
}

export async function createEventType(data: {
  title: string;
  description?: string;
  duration_minutes: number;
  color?: string;
  buffer_before?: number;
  buffer_after?: number;
  min_notice_minutes?: number;
  max_bookings_per_day?: number;
  assignment_type?: string;
  price_amount?: number;
  price_currency?: string;
  slot_interval?: number;
  custom_fields?: FieldDef[];
}): Promise<EventType> {
  return request<EventType>('/api/event-types', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listEventTypes(): Promise<EventType[]> {
  return request<EventType[]>('/api/event-types');
}

export async function updateEventType(id: string, data: {
  title: string;
  description?: string;
  duration_minutes: number;
  color?: string;
  buffer_before?: number;
  buffer_after?: number;
  min_notice_minutes?: number;
  max_bookings_per_day?: number;
  assignment_type?: string;
  price_amount?: number;
  price_currency?: string;
  slot_interval?: number;
  custom_fields?: FieldDef[];
}): Promise<EventType> {
  return request<EventType>(`/api/event-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteEventType(id: string): Promise<void> {
  return request<void>(`/api/event-types/${id}`, { method: 'DELETE' });
}

// ── Availability ──

export interface Availability {
  id: string;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export async function createAvailability(data: { day_of_week: number; start_time: string; end_time: string }): Promise<Availability> {
  return request<Availability>('/api/availabilities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listAvailabilities(): Promise<Availability[]> {
  return request<Availability[]>('/api/availabilities');
}

export async function updateAvailability(id: string, data: { day_of_week: number; start_time: string; end_time: string }): Promise<Availability> {
  return request<Availability>(`/api/availabilities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAvailability(id: string): Promise<void> {
  return request<void>(`/api/availabilities/${id}`, { method: 'DELETE' });
}

// ── Bookings ──

export interface Booking {
  id: string;
  event_type_id: string;
  user_id: string;
  booker_name: string;
  booker_email: string;
  booker_phone: string | null;
  start_time: string;
  end_time: string;
  status: string;
  created_at: string;
  manage_token?: string;
  video_conference_url?: string;
  event_type_title?: string;
  custom_field_answers?: Record<string, { label?: string; value?: string }>;
}

export async function listMyBookings(): Promise<Booking[]> {
  return request<Booking[]>('/api/bookings');
}

export async function cancelBooking(id: string): Promise<Booking> {
  return request<Booking>(`/api/bookings/${id}/cancel`, { method: 'PUT' });
}

// ── Public Booking ──

export interface PublicProfile {
  company: Company;
  user: {
    id: string;
    display_name: string;
    email: string;
    avatar_url: string | null;
  };
  event_types: EventType[];
}

export async function getPublicProfile(slug: string): Promise<PublicProfile> {
  return request<PublicProfile>(`/api/${slug}/profile`);
}

export interface AvailableSlots {
  date: string;
  slots: string[];
}

export async function getAvailableSlots(slug: string, date: string, timezone?: string): Promise<AvailableSlots> {
  const params = new URLSearchParams({ date });
  if (timezone) params.set('timezone', timezone);
  return request<AvailableSlots>(`/api/${slug}/slots?${params}`);
}

export async function createBooking(slug: string, data: {
  event_type_id: string;
  booker_name: string;
  booker_email: string;
  booker_phone?: string;
  start_time: string;
  end_time: string;
  custom_field_answers?: Record<string, string>;
}): Promise<Booking> {
  return request<Booking>(`/api/${slug}/book`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface DayOff {
  id: string;
  user_id: string;
  date: string;
  reason: string | null;
  created_at: string;
}

export async function listMyDaysOff(): Promise<DayOff[]> {
  return request<DayOff[]>('/api/days-off');
}

export async function createDayOff(date: string, reason?: string): Promise<DayOff> {
  return request<DayOff>('/api/days-off', {
    method: 'POST',
    body: JSON.stringify({ date, reason }),
  });
}

export async function deleteDayOff(id: string): Promise<void> {
  return request<void>(`/api/days-off/${id}`, { method: 'DELETE' });
}
