# Trips UI Wireframes

This folder contains the wireframes for the Trips workflow in Vuna Transport.

The wireframes are intended to guide the implementation of the mobile trip execution flow. They define the expected screen structure, navigation, information hierarchy, and main user actions.

The designs are low-fidelity wireframes, so the implementation should reuse the existing application's design system, components, spacing, typography, colors, and interaction patterns where possible.

---

## Flow

```text
Trips Home
    ↓
Delivery Trip Details
    ↓
Delivery Note Details
    ↓
Proof of Delivery
```

After successfully submitting Proof of Delivery, return the user to **Delivery Trip Details** and move focus to the **next stop in the trip**.

Back navigation should return the user to the previous screen without losing relevant state unnecessarily.

---

# Screens

## `home-page.png`

### Purpose

The Trips Home screen should:

- Show trips relevant to the current user or driver.
- Make the active/current trip easy to identify.
- Allow the user to open a Delivery Trip.

### Expected behaviour

- Active or in-progress trips should be visually easy to distinguish.
- Tapping a trip should open the corresponding Delivery Trip Details screen.
- Empty, loading, and error states should be handled appropriately.

---

## `delivery-trip-details.png`

### Purpose

The Delivery Trip Details screen should:

- Show the details and progress of one Delivery Trip.
- Show the delivery stops / Delivery Notes associated with the trip.
- Show overall trip progress.

### Expected behaviour

- Stops should be displayed in their delivery order where applicable.
- Completed, current, and pending stops should be visually distinguishable.
- Tapping a stop / Delivery Note should open Delivery Note Details.
- After completing a POD, this screen should refresh and highlight or focus the next stop.

---

## `delivery-note-details.png`

### Purpose

The Delivery Note Details screen should show:

- Customer
- Delivery address
- Contact information where available
- An action to call the customer if the delivery has not yet been completed
- Items and quantities
- Delivery status
- An action to complete the delivery as either a success or failure

### Expected behaviour

- Only show actions that are valid for the current Delivery Note / delivery state.
- The user should be able to proceed to Proof of Delivery from this screen.
- If the delivery is already completed, completion actions should no longer be available.
- Item quantities should come from the existing Delivery Note / backend data.

---

## `proof-of-delivery.png`

### Purpose

The Proof of Delivery screen should capture:

- Delivery outcome
- Delivered quantities
- Rejected quantities
- Receiver name
- Remarks
- Attachments / photos
- Delivery timestamp

### Expected behaviour

- Use the existing Vuna Proof of Delivery backend workflow and validations.
- Do not invent new delivery outcomes or statuses if existing values already exist.
- Delivered and rejected quantities must remain valid according to backend rules.
- Proof of Delivery must remain linked to the correct Delivery Note / stop.
- Submission should be server-authoritative.

### After submission

On successful POD submission:

```text
Proof of Delivery
    ↓
Delivery Trip Details
    ↓
Focus / highlight next stop
```

The trip progress and stop states should refresh immediately.

---

# Navigation

Expected navigation flow:

```text
Trips Home
→ Delivery Trip Details
→ Delivery Note Details
→ Proof of Delivery
```

Back navigation:

```text
Proof of Delivery
→ Delivery Note Details

Delivery Note Details
→ Delivery Trip Details

Delivery Trip Details
→ Trips Home
```

Do not unnecessarily discard already-loaded trip state when navigating backwards.

---

# Implementation Notes

Before implementing the wireframes:

1. Inspect the existing frontend architecture and routing.
2. Reuse existing components where possible.
3. Inspect the existing APIs and backend logic for:
   - Delivery Trip
   - Delivery Stop
   - Delivery Note
   - Proof of Delivery
   - current user / driver
   - delivery status transitions
4. Keep backend validation as the source of truth.
5. Preserve existing permissions and business rules.
6. Do not introduce new statuses or workflows unless the current backend is missing functionality required by the wireframes.

The PNG wireframes should be treated as the source of truth for:

- layout
- information hierarchy
- navigation
- major actions

They should **not** be treated as a new visual design system.

---

# Suggested Reusable UI Components

Reuse or create small reusable components where appropriate, such as:

```text
TripCard
TripStatusBadge
TripProgress
DeliveryStopCard
CustomerSummary
AddressSummary
DeliveryItemList
PODStatus
LoadingState
EmptyState
ErrorState
```

These names are only suggestions. Follow the naming and component conventions already used in the project.

---

# General UX Requirements

- Mobile-first.
- Important trip and delivery status information should be easy to scan.
- Primary actions should be easy to reach.
- Long customer names, addresses, and item lists should wrap cleanly.
- Avoid unnecessary horizontal scrolling.
- Handle loading, empty, error, and already-completed states.
- Avoid duplicating backend business logic in the frontend.
