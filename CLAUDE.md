# Behavioral Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

# Calendae Roadmap (Calendly/Cal.com self-hosted equivalent)

## Core (fait)
- Auth JWT, User/Company/EventType/Availability/Booking CRUD
- Public booking page (`/{slug}` → event type → date → slot → confirm)
- Buffer times, min notice, max bookings/day, assignment type
- Custom fields (routing forms) on event types
- Booking conflict detection
- Webhooks (booking.created, .cancelled, .rescheduled)
- Google Calendar sync (OAuth, busy events, create/delete)
- Jitsi video conferencing (auto-generated links)
- SMTP invitation + confirmation emails
- Booking management via token (`/booked/{token}`)
- Setup wizard, dashboard, team management, availability settings
- Calendar month view
- Invitation flow with pending users (`__INVITED__` sentinel)

## Disponibilité (Availability Engine)
- [x] Buffer times (avant/après)
- [x] Minimum notice delay
- [x] Max bookings per day
- [ ] Slot limiter (par semaine/mois)
- [ ] Custom time increments (5, 10, 15, 30, 60 min)
- [ ] Multiples plages par jour (ex: Lun 9-12 ET 14-18)
- [ ] Timezone detection automatique + DST
- [ ] Disponibilités par type d'événement (calendriers spécifiques)

## Types d'événements & Logique d'équipe
- [x] One-on-one (solo)
- [x] Round robin (distribution équitable)
- [x] Collective (tous disponibles)
- [ ] Événement de groupe (Seats) — un hôte, N places
- [ ] Impersonnel / Clone d'équipe (masquer l'identité)
- [ ] Booking au nom d'autres (déléguer à un coéquipier)
- [ ] Politique d'annulation configurable

## Formulaires & Routage
- [x] Champs personnalisés (text, textarea, select, radio, checkbox, phone, number)
- [ ] Logique conditionnelle (si réponse X → router vers agenda Y)
- [ ] Routage par URL / pré-remplissage (?name=John&email=...)
- [ ] Filtrage des invités selon réponses
- [ ] Embed JS (widget iframe/pop-in/DOM)

## Workflows & Automatisation
- [ ] Déclencheurs (Triggers) : création, X temps avant, X temps après, annulation, déplacement
- [ ] Canaux : email (HTML), SMS (Twilio), WhatsApp
- [ ] Rappels de confirmation (validation manuelle avant confirmation)
- [ ] Flux de rappels (avant/après réunion)
- [ ] Templates d'emails personnalisés

## Intégrations
- [x] Google Calendar (sync busy, create/delete events)
- [x] Jitsi Meet (visio)
- [ ] CalDAV (Nextcloud, Fastmail, etc.)
- [ ] Outlook / Office 365 calendar
- [ ] Zoom, Google Meet, Microsoft Teams (auto-gen links)
- [ ] Stripe / PayPal (paiement avant réservation)
- [ ] HubSpot CRM (routage par assignation)
- [ ] Salesforce CRM
- [ ] Google Analytics / Meta Pixel / Umami
- [ ] Mailchimp / Zapier
- [ ] Microsoft Dynamics 365 / Power Automate

## API & Développeurs
- [ ] API REST complète (création utilisateurs, modif disponibilités, etc.)
- [ ] Webhooks (fait partiellement — tous les événements)
- [ ] SCIM (provisionnement utilisateurs)
- [ ] Embed JS (widget de réservation)
- [ ] Mobile app / Browser extension

## Administration & Sécurité
- [ ] Marque blanche (domaine personnalisé, logo, couleurs, footer)
- [x] Gestion d'équipe (membres, rôles)
- [ ] SSO SAML
- [ ] Analyses et insights d'équipe
- [ ] Groupes d'équipes + administrateurs
- [ ] Événements gérés par admin (assignés à l'équipe)
- [ ] Suppression des données (conformité)
- [ ] Domain management + account monitoring

## UX / Qualité de vie
- [ ] Instant Meeting (lancement visio immédiat sans planification)
- [ ] Sondages de réunion (Doodle-like)
- [ ] Profils de contact + activité de planification
- [ ] Partage de disponibilité depuis profil
- [ ] Vue "Disponibilité" — statistiques (temps total, jours chargés, taux d'annulation)
- [x] Lien d'annulation/report en 1 clic dans les emails
