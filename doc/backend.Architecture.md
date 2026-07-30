# NOVA DRIVE Rentals Car Rental — Backend Architecture
### Phase 1: Database, API & Systems Design — **v1.1 (Corrected)**

> **Derived from complete frontend analysis** — all tables, fields, relationships, and workflows match the live frontend exactly.
>
> **v1.1 Corrections Applied:**
> - ❌ Stripe removed from all schemas, enums, and workflows
> - ❌ Customer Portal removed (no customer auth, login, dashboard, or self-service APIs)
> - ❌ Driver creation removed from Drivers module — driver accounts created via `POST /users` (role=Driver) only

---

## Table of Contents
1. [Platform Overview](#1-platform-overview)
2. [Role Definitions & Permission Matrix](#2-role-definitions--permission-matrix)
3. [Authentication Architecture](#3-authentication-architecture)
4. [Database Schema — All Modules](#4-database-schema--all-modules)
5. [Entity Relationships (ERD Summary)](#5-entity-relationships-erd-summary)
6. [Status Enums — All Modules](#6-status-enums--all-modules)
7. [API Architecture — All Endpoints](#7-api-architecture--all-endpoints)
8. [Dashboard Data Flow](#8-dashboard-data-flow)
9. [Module Integration Flow](#9-module-integration-flow)
10. [Module Dependency Map](#10-module-dependency-map)

---

## 1. Platform Overview

**NOVA DRIVE** is a rental car rental platform operating in Florida/California. It supports **three active system roles**:

| Persona | Entry Point | Core Function |
|---|---|---|
| **ADMIN** | `/dashboard` (admin) | Full platform control, booking lifecycle, finance |
| **OPERATIONS_MANAGER** | `/dashboard` (operations) | Dispatch, fleet, tasks, incidents, driver management |
| **DRIVER** | `/dashboard` (driver) | Trip assignments, navigation, inspections |

> **Customer Portal:** Not part of current implementation. Customer records exist as admin-managed data only. No customer login, JWT role, or self-service APIs are built.

**Booking Lifecycle (12-Stage Pipeline):**
```
Pending Review → License Verified → Contract Sent → Contract Signed →
Payment Completed → Driver Assigned → Delivery Scheduled → In Transit →
Delivered → Active Rental → Returned → Completed
```

**Supported Payment Methods:**
```
Credit/Debit Card  — Manual card processing
Zelle              — Bank-to-bank transfer
Cash App           — Mobile payment
Pay At Delivery    — Deferred cash payment on delivery
```

---

## 2. Role Definitions & Permission Matrix

### 2.1 System Roles

```
ADMIN              — Full system access, user management, finance
OPERATIONS_MANAGER — Operations with sub-role granularity
DRIVER             — Trip-only interface, no admin access
```

> **CUSTOMER role is NOT implemented.** Customer data is created and managed by ADMIN only.

### 2.2 Operations Sub-Roles (Frontend-defined)

The Operations dashboard supports role-switching with granular permissions:

| Sub-Role | Permissions |
|---|---|
| Operations Manager | All operational actions |
| Dispatcher | Assign Driver, Schedule Return |
| Fleet Coordinator | Vehicle Readiness, Vehicle Inspection |
| Driver Supervisor | Assign Driver, Vehicle Inspection |
| Maintenance Coordinator | Vehicle Readiness, Vehicle Inspection |
| Operations Staff | View Only |

### 2.3 Role Permissions Matrix

| Permission | ADMIN | OPS_MGR | DRIVER |
|---|---|---|---|
| Create Booking | ✅ | ❌ | ❌ |
| View All Bookings | ✅ | ✅ | ❌ |
| Verify License | ✅ | ❌ | ❌ |
| Send Contract | ✅ | ❌ | ❌ |
| Sign Contract (on behalf) | ✅ | ❌ | ❌ |
| Void/Archive Contract | ✅ | ❌ | ❌ |
| Record Payment | ✅ | ❌ | ❌ |
| Issue Refund | ✅ | ❌ | ❌ |
| Release Deposit | ✅ | ❌ | ❌ |
| Assign Driver | ✅ | ✅ | ❌ |
| Schedule Delivery | ✅ | ✅ | ❌ |
| Mark In Transit | ✅ | ✅ | ✅ |
| Accept/Reject Assignment | ❌ | ❌ | ✅ |
| Complete Inspection | ✅ | ✅ | ✅ |
| Start/Complete Trip | ❌ | ❌ | ✅ |
| Create Task | ✅ | ✅ | ❌ |
| Update Vehicle Status | ✅ | ✅ | ❌ |
| Create Incident | ✅ | ✅ | ✅ (report) |
| Manage Users | ✅ | ❌ | ❌ |
| Create Driver Account | ✅ | ❌ | ❌ |
| Manage Driver Operations | ✅ | ✅ | ❌ |
| Manage Customer Records | ✅ | ❌ | ❌ |
| View Finance | ✅ | ❌ | ❌ |
| View Reports | ✅ | ❌ | ❌ |

---

## 3. Authentication Architecture

### 3.1 Auth Flow

```
Client → POST /auth/login
       ← { accessToken (JWT, 15min), refreshToken (30d), user{}, role }

Client → POST /auth/refresh-token
       ← { accessToken (new) }

Client → POST /auth/logout  [invalidate refresh token]

Client → POST /auth/forgot-password  [sends OTP to email]
Client → POST /auth/verify-otp
Client → POST /auth/reset-password

Client → POST /auth/lock-screen  [frontend session lock]
Client → POST /auth/unlock       [PIN/password re-entry]
```

> **No customer self-registration endpoint.** `POST /auth/register` is not implemented. All user accounts are provisioned by ADMIN.

### 3.2 JWT Payload Structure

```json
{
  "sub": "user_uuid",
  "role": "ADMIN | OPERATIONS_MANAGER | DRIVER",
  "employeeId": "ADM-001",
  "email": "admin@novadrive.com",
  "iat": 1700000000,
  "exp": 1700000900
}
```

### 3.3 Auth Database Tables

#### `users` table (master auth table — ADMIN, OPS, DRIVER only)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `employee_id` | VARCHAR(20) UNIQUE | ADM-001, OPS-001, DRV-001 |
| `name` | VARCHAR(255) | |
| `username` | VARCHAR(100) UNIQUE | |
| `email` | VARCHAR(255) UNIQUE | |
| `phone` | VARCHAR(30) | |
| `password_hash` | VARCHAR(255) | bcrypt, cost=12 |
| `role` | ENUM | ADMIN, OPERATIONS_MANAGER, DRIVER |
| `status` | ENUM | Active, Pending, Inactive |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `last_login` | TIMESTAMP | |

#### `refresh_tokens` table

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → users.id | |
| `token_hash` | VARCHAR(255) | hashed refresh token |
| `expires_at` | TIMESTAMP | |
| `revoked` | BOOLEAN | |
| `created_at` | TIMESTAMP | |

#### `otp_codes` table

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → users.id | |
| `code_hash` | VARCHAR(255) | |
| `purpose` | ENUM | forgot_password, phone_verify |
| `expires_at` | TIMESTAMP | 10 minutes |
| `used` | BOOLEAN | |

---

## 4. Database Schema — All Modules

---

### MODULE 1: USERS

#### `users` (defined above in Auth section)

> When `role = DRIVER`, creating a user via `POST /users` **automatically provisions** a corresponding `drivers` profile record in the same transaction.

#### `user_sessions` — Track active sessions

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → users.id | |
| `session_token` | VARCHAR(255) | |
| `ip_address` | VARCHAR(45) | |
| `device` | VARCHAR(255) | |
| `expires_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |

---

### MODULE 2: DRIVERS

> **Driver Creation Rule:** Driver accounts are created **exclusively** via `POST /users` with `role = Driver`. The system auto-provisions a `drivers` profile record linked to the new user. The Drivers module manages **operational data only** — availability, assignments, documents, performance, compliance, and incidents.

#### `drivers` — Extended operational profile (auto-provisioned on user creation)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → users.id | 1:1 link to users table |
| `driver_id_code` | VARCHAR(20) UNIQUE | drv-01, drv-02 (auto-generated) |
| `name` | VARCHAR(255) | Mirrored from users.name |
| `email` | VARCHAR(255) | Mirrored from users.email |
| `phone` | VARCHAR(30) | Mirrored from users.phone |
| `address` | TEXT | Home address |
| `license_number` | VARCHAR(50) UNIQUE | DL-908234-A |
| `commercial_license_number` | VARCHAR(50) | CDL-40918-B |
| `availability` | ENUM | Available, Unavailable, On Leave, Suspended, Online, Busy, Break, Offline |
| `duty_status` | ENUM | Available, Assigned, On Route, Return Pickup, Off Duty, Completed Assignment |
| `deliveries_count` | INT DEFAULT 0 | |
| `rating` | DECIMAL(3,2) DEFAULT 5.00 | 0.00–5.00 |
| `on_time_rate` | DECIMAL(5,2) DEFAULT 100.00 | Percentage |
| `hire_date` | DATE | |
| `joined_date` | DATE | |
| `last_active` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

#### `driver_documents` — Compliance document vault

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `driver_id` | UUID FK → drivers.id | |
| `doc_type` | ENUM | driver_license, commercial_license, govt_id, insurance, background_check, medical_certificate |
| `doc_status` | ENUM | Valid, Expiring Soon, Expired |
| `expiry_date` | DATE | |
| `file_url` | TEXT | S3/CDN URL |
| `uploaded_at` | TIMESTAMP | |
| `verified_by` | UUID FK → users.id | Admin who verified |

#### `driver_emergency_contacts`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `driver_id` | UUID FK → drivers.id | |
| `contact_name` | VARCHAR(255) | |
| `relationship` | VARCHAR(100) | |
| `phone` | VARCHAR(30) | |

#### `driver_incidents` — Per-driver incident registry

| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR(20) PK | inc-01 |
| `driver_id` | UUID FK → drivers.id | |
| `incident_date` | DATE | |
| `type` | ENUM | Late Arrival, Policy Violation, Customer Complaint, Accident, Vehicle Issue |
| `severity` | ENUM | Minor, Medium, High, Critical |
| `notes` | TEXT | |
| `resolution_status` | ENUM | Open, Investigating, Resolved |
| `created_at` | TIMESTAMP | |

#### `driver_timeline` — Activity history

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `driver_id` | UUID FK → drivers.id | |
| `event_date` | TIMESTAMP | |
| `title` | VARCHAR(255) | |
| `description` | TEXT | |

---

### MODULE 3: VEHICLES

#### `vehicles` — Fleet asset registry

| Field | Type | Notes |
|---|---|---|
| `id` | INT PK AUTO | |
| `name` | VARCHAR(255) | Rolls-Royce Spectre |
| `type` | ENUM | Electric, Sport, SUV, Convertible, Sedan, Car |
| `status` | ENUM | Available, Reserved, Active Rental, Maintenance, Booked |
| `price_per_day` | DECIMAL(10,2) | |
| `year` | VARCHAR(4) | |
| `color` | VARCHAR(100) | |
| `mileage` | VARCHAR(50) | "1,240 mi" |
| `fuel_level` | VARCHAR(10) | "94%" |
| `vin_number` | VARCHAR(50) UNIQUE | |
| `license_plate` | VARCHAR(20) UNIQUE | LXR-901B |
| `insurance_expiry` | DATE | |
| `registration_expiry` | DATE | |
| `next_service` | VARCHAR(50) | |
| `image_url` | TEXT | |
| `zero_to_sixty` | VARCHAR(20) | "4.4s" |
| `top_speed` | VARCHAR(20) | "155 mph" |
| `range` | VARCHAR(20) | "320 mi" |
| `drivetrain` | VARCHAR(100) | |
| `revenue_total` | DECIMAL(12,2) DEFAULT 0 | |
| `trips_count` | INT DEFAULT 0 | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

#### `vehicle_documents`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `vehicle_id` | INT FK → vehicles.id | |
| `doc_type` | ENUM | insurance, registration, inspection_report, maintenance_record |
| `file_url` | TEXT | |
| `issue_date` | DATE | |
| `expiry_date` | DATE | |
| `notes` | TEXT | |
| `uploaded_at` | TIMESTAMP | |

#### `vehicle_maintenance_history`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `vehicle_id` | INT FK → vehicles.id | |
| `service_date` | DATE | |
| `description` | TEXT | |
| `status` | ENUM | Scheduled, In Progress, Completed |
| `cost` | DECIMAL(10,2) | |
| `service_provider` | VARCHAR(255) | |
| `notes` | TEXT | |
| `created_at` | TIMESTAMP | |

#### `vehicle_inspection_reports` — Pre/post-delivery inspections

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `vehicle_id` | INT FK → vehicles.id | |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `stage` | ENUM | out (pre-delivery), in (post-return) |
| `fuel_level` | INT | 0–100 |
| `mileage` | INT | |
| `damage_notes` | TEXT | |
| `damage_assessment` | TEXT | |
| `additional_charges` | DECIMAL(10,2) DEFAULT 0 | |
| `inspector_name` | VARCHAR(255) | |
| `inspector_id` | UUID FK → users.id | |
| `admin_signature` | VARCHAR(255) | |
| `customer_signature` | VARCHAR(255) | Physical/digital record |
| `inspection_date` | TIMESTAMP | |
| `passed` | BOOLEAN | |

---

### MODULE 4: BOOKINGS

#### `bookings` — Central booking ledger (master table)

| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR(20) PK | RSV-8829, GFR-2026-XXXX |
| `status` | ENUM | See Status Enums §6 |
| `customer_id` | UUID FK → customers.id | |
| `customer_name` | VARCHAR(255) | Denormalized for perf |
| `customer_email` | VARCHAR(255) | |
| `customer_phone` | VARCHAR(30) | |
| `vehicle_id` | INT FK → vehicles.id | |
| `vehicle_name` | VARCHAR(255) | Denormalized |
| `vehicle_image_url` | TEXT | |
| `start_date` | DATE | |
| `end_date` | DATE | |
| `pickup_location` | VARCHAR(255) | Beverly Hills Hub |
| `return_location` | VARCHAR(255) | |
| `total_price` | DECIMAL(10,2) | Rental base amount |
| `payment_status` | ENUM | Pending, Paid, Refunded, Partial |
| `payment_method` | ENUM | Credit/Debit Card, Zelle, Cash App, Pay At Delivery |
| `license_status` | ENUM | Pending Review, Verified, Rejected |
| `contract_status` | ENUM | Draft, Sent, Signed, Voided, Archived |
| `delivery_status` | ENUM | Not Scheduled, Scheduled, Assigned, In Transit, Delivered, Closed, Return Scheduled |
| `driver_id` | UUID FK → drivers.id NULLABLE | |
| `driver_name` | VARCHAR(255) DEFAULT 'Unassigned' | |
| `inspection_out_id` | UUID FK → vehicle_inspection_reports.id | |
| `inspection_in_id` | UUID FK → vehicle_inspection_reports.id | |
| `last_contacted_date` | DATE | |
| `notes` | TEXT | General notes |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `created_by` | UUID FK → users.id | Admin who created |

#### `booking_risk_profiles`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `risk_level` | ENUM | Low, Medium, High, Critical |
| `outstanding_balance` | DECIMAL(10,2) DEFAULT 0 | |
| `damage_history` | TEXT DEFAULT 'None' | |
| `blacklisted` | BOOLEAN DEFAULT FALSE | |

#### `booking_communications` — Communication timeline

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `comm_type` | ENUM | Call, Email, WhatsApp, SMS, In Person |
| `content` | TEXT | |
| `logged_by` | UUID FK → users.id | |
| `comm_date` | TIMESTAMP | |

#### `booking_internal_notes`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `note_text` | TEXT | |
| `priority` | ENUM | Low, Medium, High |
| `created_by` | UUID FK → users.id | |
| `created_at` | TIMESTAMP | |

#### `booking_follow_up_reminders`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `content` | TEXT | |
| `reminder_date` | DATETIME | |
| `created_by` | UUID FK → users.id | |
| `is_completed` | BOOLEAN DEFAULT FALSE | |
| `created_at` | TIMESTAMP | |

#### `booking_timeline` — Full audit trail per booking

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `event_date` | TIMESTAMP | |
| `title` | VARCHAR(255) | "License Verified" |
| `description` | TEXT | |
| `triggered_by` | UUID FK → users.id | |

#### `booking_activity_logs` — Admin action log

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `action` | VARCHAR(255) | "License Approved" |
| `performed_by` | UUID FK → users.id | |
| `performed_at` | TIMESTAMP | |

---

### MODULE 5: CUSTOMERS

> **Admin-Managed Only.** No customer login, authentication, or self-service. All customer records are created and managed by ADMIN via the admin dashboard.

#### `customers` — Customer data record (admin-managed)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `customer_code` | VARCHAR(20) UNIQUE | CUST-101 (auto-generated) |
| `name` | VARCHAR(255) | |
| `phone` | VARCHAR(30) | |
| `email` | VARCHAR(255) UNIQUE | |
| `address` | TEXT | |
| `membership_tier` | ENUM | Standard, Gold, Platinum, Standard |
| `kyc_status` | ENUM | Verified, Pending, Rejected |
| `account_status` | ENUM | Active, Suspended, Blacklisted |
| `risk_score` | ENUM | Low, Medium, High, Critical |
| `total_rentals` | INT DEFAULT 0 | |
| `total_spent` | DECIMAL(12,2) DEFAULT 0 | |
| `joined_date` | DATE | |
| `blacklisted` | BOOLEAN DEFAULT FALSE | |
| `blacklist_reason` | TEXT | |
| `created_at` | TIMESTAMP | |
| `created_by` | UUID FK → users.id | Admin who created |

#### `customer_emergency_contacts`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `customer_id` | UUID FK → customers.id | |
| `contact_name` | VARCHAR(255) | |
| `relationship` | VARCHAR(100) | |
| `phone` | VARCHAR(30) | |

#### `customer_documents` — KYC + rental documents (managed by admin)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `customer_id` | UUID FK → customers.id | |
| `doc_name` | VARCHAR(255) | "Driver License Front" |
| `doc_type` | ENUM | image, pdf |
| `doc_status` | ENUM | Pending, Approved, Rejected |
| `file_url` | TEXT | |
| `upload_date` | DATE | |
| `reviewed_by` | UUID FK → users.id | Admin reviewer |

---

### MODULE 6: CONTRACTS

#### `contracts`

| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR(20) PK | CON-8829 |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `customer_name` | VARCHAR(255) | |
| `customer_phone` | VARCHAR(30) | |
| `customer_email` | VARCHAR(255) | |
| `customer_address` | TEXT | |
| `vehicle_name` | VARCHAR(255) | |
| `vehicle_category` | VARCHAR(100) | |
| `license_plate` | VARCHAR(20) | |
| `start_date` | DATE | |
| `end_date` | DATE | |
| `rental_amount` | DECIMAL(10,2) | |
| `security_deposit` | DECIMAL(10,2) DEFAULT 2500 | |
| `taxes` | DECIMAL(10,2) | |
| `delivery_fee` | DECIMAL(10,2) DEFAULT 50 | |
| `grand_total` | DECIMAL(10,2) | |
| `mileage_allowance` | INT | Daily miles allowed |
| `fuel_policy` | TEXT | |
| `status` | ENUM | Draft, Sent, Signed, Voided, Archived |
| `signature_status` | ENUM | Not Sent, Sent, Signed |
| `admin_signature` | VARCHAR(255) | |
| `customer_signature` | VARCHAR(255) | Physical/digital record |
| `signed_date` | DATE | |
| `created_date` | DATE | |
| `terms_version` | VARCHAR(20) DEFAULT 'v1.0' | For future versioning |
| `created_by` | UUID FK → users.id | |

#### `contract_timeline`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `contract_id` | VARCHAR(20) FK → contracts.id | |
| `event_date` | TIMESTAMP | |
| `title` | VARCHAR(255) | "Contract Sent" |
| `performed_by` | UUID FK → users.id | |

---

### MODULE 7: PAYMENTS

> **Stripe removed.** All payments are manually recorded by ADMIN. Supported methods: **Credit/Debit Card, Zelle, Cash App, Pay At Delivery.**

#### `payments` — Transaction records per booking

| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR(20) PK | PMT-8829, TRX-9921 |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `customer_id` | UUID FK → customers.id | |
| `customer_name` | VARCHAR(255) | |
| `vehicle_name` | VARCHAR(255) | |
| `payment_type` | ENUM | Rental Payment, Security Deposit, Insurance Surcharge, Delivery Fee, Late Fee, Toll Charge, Damage Charge |
| `amount` | DECIMAL(10,2) | |
| `deposit_amount` | DECIMAL(10,2) | |
| `grand_total` | DECIMAL(10,2) | |
| `method` | ENUM | Credit/Debit Card, Zelle, Cash App, Pay At Delivery |
| `transaction_id` | VARCHAR(100) | External reference (optional) |
| `status` | ENUM | Pending, Paid, Failed, Refunded, Partial |
| `created_date` | DATE | |
| `recorded_by` | UUID FK → users.id | Admin who recorded |
| `created_at` | TIMESTAMP | |

#### `invoices`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `invoice_number` | VARCHAR(30) UNIQUE | INV-2026-8829 |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `customer_id` | UUID FK → customers.id | |
| `customer_name` | VARCHAR(255) | |
| `vehicle_name` | VARCHAR(255) | |
| `issue_date` | DATE | |
| `due_date` | DATE | |
| `rental_amount` | DECIMAL(10,2) | |
| `taxes` | DECIMAL(10,2) | |
| `delivery_fee` | DECIMAL(10,2) | |
| `security_deposit` | DECIMAL(10,2) | |
| `grand_total` | DECIMAL(10,2) | |
| `status` | ENUM | Draft, Sent, Paid, Overdue, Voided |
| `generated_by` | UUID FK → users.id | |

#### `deposits` — Security deposit lifecycle

| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR(20) PK | DEP-8829 |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `customer_id` | UUID FK → customers.id | |
| `customer_name` | VARCHAR(255) | |
| `vehicle_name` | VARCHAR(255) | |
| `amount` | DECIMAL(10,2) DEFAULT 2500 | |
| `collected_date` | DATE | |
| `status` | ENUM | Pending, Held, Released, Forfeited |
| `release_date` | DATE | |
| `release_reason` | TEXT | |
| `released_by` | UUID FK → users.id | |

#### `refunds`

| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR(20) PK | REF-3001 |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `payment_id` | VARCHAR(20) FK → payments.id | |
| `customer_id` | UUID FK → customers.id | |
| `customer_name` | VARCHAR(255) | |
| `amount` | DECIMAL(10,2) | |
| `reason` | VARCHAR(255) | |
| `method` | ENUM | Credit/Debit Card, Zelle, Cash App, Pay At Delivery |
| `status` | ENUM | Pending, Completed, Failed |
| `created_date` | DATE | |
| `processed_by` | UUID FK → users.id | |

#### `payment_timeline` — Per-booking payment event log

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `event_date` | TIMESTAMP | |
| `title` | VARCHAR(255) | "Payment Settled" |
| `description` | TEXT | |

---

### MODULE 8: DELIVERIES

#### `deliveries` — Logistics dispatch per booking

| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR(20) PK | DEL-8829 |
| `booking_id` | VARCHAR(20) FK → bookings.id | |
| `customer_id` | UUID FK → customers.id | |
| `customer_name` | VARCHAR(255) | |
| `customer_contact` | VARCHAR(30) | |
| `vehicle_id` | INT FK → vehicles.id | |
| `vehicle_name` | VARCHAR(255) | |
| `driver_id` | UUID FK → drivers.id NULLABLE | |
| `driver_name` | VARCHAR(255) DEFAULT 'Unassigned' | |
| `delivery_address` | TEXT | Dropoff address |
| `status` | ENUM | Not Scheduled, Scheduled, Driver Assigned, Accepted, En Route, In Transit, Arrived, Inspection Complete, Trip Active, Delivered, Return Scheduled, Returned, Closed |
| `schedule_date` | DATETIME | |
| `special_instructions` | TEXT | |
| `rejection_reason` | VARCHAR(255) | Driver rejection reason |
| `return_date` | DATETIME | |
| `return_location` | VARCHAR(255) | |
| `return_driver_id` | UUID FK → drivers.id NULLABLE | |
| `return_notes` | TEXT | |
| `pre_delivery_inspection_id` | UUID FK → vehicle_inspection_reports.id | |
| `return_inspection_id` | UUID FK → vehicle_inspection_reports.id | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

#### `delivery_timeline`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `delivery_id` | VARCHAR(20) FK → deliveries.id | |
| `event_date` | TIMESTAMP | |
| `title` | VARCHAR(255) | "Driver Assigned" |
| `description` | TEXT | |
| `triggered_by` | UUID FK → users.id | |

---

### MODULE 9: TASKS

#### `tasks` — Operations workflow tasks

| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR(20) PK | TSK-001 |
| `title` | VARCHAR(255) | |
| `type` | ENUM | Cleaning, Inspection, Maintenance, Vehicle Delivery, Vehicle Pickup, Documentation, Customer Follow Up, Emergency |
| `priority` | ENUM | Low, Medium, High, Critical |
| `status` | ENUM | Pending, Assigned, In Progress, Completed, Cancelled |
| `vehicle_id` | INT FK → vehicles.id NULLABLE | |
| `vehicle_name` | VARCHAR(255) | |
| `booking_id` | VARCHAR(20) FK → bookings.id NULLABLE | |
| `assigned_to` | UUID FK → users.id NULLABLE | |
| `notes` | TEXT | |
| `due_date` | DATE | |
| `completed_at` | TIMESTAMP | |
| `created_by` | UUID FK → users.id | |
| `created_at` | TIMESTAMP | |

---

### MODULE 10: NOTIFICATIONS

#### `notifications`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → users.id | Recipient (ADMIN, OPS, DRIVER only) |
| `title` | VARCHAR(255) | |
| `body` | TEXT | |
| `type` | ENUM | booking, payment, contract, delivery, driver_assignment, task, system, emergency |
| `reference_id` | VARCHAR(50) | booking_id, delivery_id, etc. |
| `reference_type` | VARCHAR(50) | booking, delivery, contract, payment |
| `is_read` | BOOLEAN DEFAULT FALSE | |
| `priority` | ENUM | Low, Normal, High, Critical |
| `created_at` | TIMESTAMP | |

#### `notification_preferences`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → users.id | |
| `email_enabled` | BOOLEAN DEFAULT TRUE | |
| `sms_enabled` | BOOLEAN DEFAULT FALSE | |
| `push_enabled` | BOOLEAN DEFAULT TRUE | |
| `booking_alerts` | BOOLEAN DEFAULT TRUE | |
| `payment_alerts` | BOOLEAN DEFAULT TRUE | |
| `driver_alerts` | BOOLEAN DEFAULT TRUE | |

---

### MODULE 11: ACTIVITIES (Global Feed)

#### `activities` — Platform-wide live activity feed

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `title` | VARCHAR(255) | "Booking RSV-8829 Created" |
| `description` | TEXT | |
| `module` | ENUM | booking, contract, payment, delivery, driver, vehicle, task, user, incident |
| `reference_id` | VARCHAR(50) | |
| `performed_by` | UUID FK → users.id | |
| `role_visibility` | ENUM | all, admin, operations |
| `created_at` | TIMESTAMP | |

---

### MODULE 12: INCIDENTS

#### `incidents` — Emergency and incident reports

| Field | Type | Notes |
|---|---|---|
| `id` | VARCHAR(20) PK | INC-001 |
| `booking_id` | VARCHAR(20) FK → bookings.id NULLABLE | |
| `vehicle_id` | INT FK → vehicles.id NULLABLE | |
| `driver_id` | UUID FK → drivers.id NULLABLE | |
| `customer_id` | UUID FK → customers.id NULLABLE | |
| `vehicle_description` | VARCHAR(255) | Free text |
| `driver_description` | VARCHAR(255) | |
| `customer_description` | VARCHAR(255) | |
| `type` | ENUM | Vehicle Damage, Late Return, Driver No Show, Customer Complaint, Accident, Mechanical Issue, Documentation Issue |
| `severity` | ENUM | Minor, Medium, High, Critical |
| `description` | TEXT | |
| `status` | ENUM | Open, Investigating, Resolved, Closed |
| `resolution_notes` | TEXT | |
| `created_by` | UUID FK → users.id | |
| `resolved_by` | UUID FK → users.id | |
| `created_at` | TIMESTAMP | |
| `resolved_at` | TIMESTAMP | |

---

## 5. Entity Relationships (ERD Summary)

```
users (ADMIN, OPS, DRIVER) ──────────────────────┐
  │                                               │
  ├─── drivers (1:1 auto-provisioned on           │
  │    user creation when role = DRIVER)          │
  │       │                                       │
  │       ├─── driver_documents (1:N)             │
  │       ├─── driver_incidents (1:N)             │
  │       ├─── driver_timeline (1:N)              │
  │       └─── driver_emergency_contacts (1:N)    │
  │                                               │
  └─── notification_preferences (1:1)             │
                                                  │
customers (admin-managed, no auth) ───────────────┤
  │                                               │
  ├─── customer_documents (1:N)                   │
  └─── customer_emergency_contacts (1:N)          │
                                                  │
vehicles ─────────────────────────────────────────┤
  │                                               │
  ├─── vehicle_documents (1:N)                    │
  ├─── vehicle_maintenance_history (1:N)          │
  └─── vehicle_inspection_reports (1:N)           │
                                                  │
bookings ────── CENTRAL HUB ─────────────────────┤
  │ FK: customer_id, vehicle_id, driver_id        │
  │                                               │
  ├─── booking_risk_profiles (1:1)                │
  ├─── booking_communications (1:N)               │
  ├─── booking_internal_notes (1:N)               │
  ├─── booking_follow_up_reminders (1:N)          │
  ├─── booking_timeline (1:N)                     │
  ├─── booking_activity_logs (1:N)                │
  │                                               │
  ├─── contracts (1:1)                            │
  │       └─── contract_timeline (1:N)            │
  │                                               │
  ├─── payments (1:N)                             │
  │       └─── payment_timeline (1:N)             │
  ├─── invoices (1:1)                             │
  ├─── deposits (1:1)                             │
  └─── refunds (1:N)                              │
                                                  │
  ├─── deliveries (1:1 per booking)              │
  │       └─── delivery_timeline (1:N)            │
  │                                               │
  └─── vehicle_inspection_reports (1:2 max)       │

incidents ── relates to bookings, vehicles, drivers (loose FK)
activities ── global audit table, no strict FK
notifications ── per user_id (ADMIN, OPS, DRIVER recipients only)
```

---

## 6. Status Enums — All Modules

### 6.1 Booking Status (12-stage lifecycle pipeline)

```
PENDING_REVIEW       — New booking, awaiting admin action
LICENSE_VERIFIED     — Customer license approved
CONTRACT_SENT        — Contract emailed to customer
CONTRACT_SIGNED      — Customer/admin signed
PAYMENT_PENDING      — Contract signed, payment awaited
PAYMENT_COMPLETED    — Full payment received
DRIVER_ASSIGNED      — Chauffeur linked to booking
DELIVERY_SCHEDULED   — Delivery date/address set
IN_TRANSIT           — Vehicle en route to customer
DELIVERED            — Vehicle handed over, rental active
ACTIVE_RENTAL        — Rental period in progress
RETURNED             — Vehicle back with NOVA DRIVE
COMPLETED            — Booking fully closed
CANCELLED            — Booking cancelled at any stage
```

### 6.2 Vehicle Status

```
AVAILABLE      — Ready for dispatch
RESERVED       — Booking confirmed, not yet active
ACTIVE_RENTAL  — Currently with customer
MAINTENANCE    — In service bay
BOOKED         — Future confirmed booking
```

### 6.3 Contract Status

```
DRAFT     — Created, not sent
SENT      — Emailed to customer
SIGNED    — Digitally executed
VOIDED    — Invalidated by admin
ARCHIVED  — Moved to archive
```

### 6.4 Payment Status

```
PENDING   — Invoice sent, not paid
PAID      — Full payment received
PARTIAL   — Partial payment captured
REFUNDED  — Full refund issued
FAILED    — Payment processing failed
```

### 6.5 Payment Method Enum

```
Credit/Debit Card  — Manual card processing, recorded by admin
Zelle              — Bank transfer, confirmed by admin
Cash App           — Mobile payment, confirmed by admin
Pay At Delivery    — Deferred payment, collected on vehicle handover
```

### 6.6 Deposit Status

```
PENDING   — Not yet collected
HELD      — Collected, held during rental
RELEASED  — Returned to customer after rental
FORFEITED — Withheld (damage/non-return)
```

### 6.7 Delivery Status (Driver trip state machine)

```
NOT_SCHEDULED        — No delivery planned
SCHEDULED            — Date/time set
DRIVER_ASSIGNED      — Chauffeur linked
ACCEPTED             — Driver accepted assignment
EN_ROUTE             — Driver navigating to customer
IN_TRANSIT           — Vehicle en route (driver moving)
ARRIVED              — Driver at location
INSPECTION_COMPLETE  — Pre-delivery checklist done
TRIP_ACTIVE          — Rental trip started
DELIVERED            — Vehicle delivered to customer
RETURN_SCHEDULED     — Return pickup scheduled
RETURNED             — Vehicle picked up
CLOSED               — Delivery fully completed
```

### 6.8 Driver Availability

```
AVAILABLE    — Ready to accept assignments
UNAVAILABLE  — Not available (no reason given)
ONLINE       — Logged in and active
BUSY         — On another assignment
BREAK        — On a break
OFFLINE      — Not on shift
ON_LEAVE     — On approved leave
SUSPENDED    — Account suspended
```

### 6.9 Driver Duty Status

```
AVAILABLE             — Ready for new assignments
ASSIGNED              — Linked to a booking
ON_ROUTE              — En route to customer
RETURN_PICKUP         — Collecting returned vehicle
COMPLETED_ASSIGNMENT  — Assignment just completed
OFF_DUTY              — Not working
```

### 6.10 Task Status

```
PENDING     — Created, not assigned
ASSIGNED    — Staff member assigned
IN_PROGRESS — Work started
COMPLETED   — Task finished
CANCELLED   — Task cancelled
```

### 6.11 Incident Status

```
OPEN          — Just reported
INVESTIGATING — Under review
RESOLVED      — Issue resolved
CLOSED        — Fully closed/archived
```

### 6.12 KYC / License Status

```
PENDING_REVIEW  — Submitted, not reviewed
VERIFIED        — Approved by admin
REJECTED        — Declined by admin
```

### 6.13 User Status

```
ACTIVE   — Login enabled
PENDING  — Created, not activated
INACTIVE — Account disabled
```

---

## 7. API Architecture — All Endpoints

### 7.1 Base Structure

```
Base URL:  https://api.novadrive.com/v1
Auth:      Bearer JWT in Authorization header
Content:   application/json
Roles:     ADMIN | OPERATIONS_MANAGER | DRIVER
```

### 7.2 Auth Endpoints

```
POST   /auth/login                     — Email/password login [ADMIN, OPS, DRIVER]
POST   /auth/logout                    — Invalidate refresh token
POST   /auth/refresh-token             — Get new access token
POST   /auth/forgot-password           — Send OTP to email
POST   /auth/verify-otp                — Verify OTP code
POST   /auth/reset-password            — Set new password
POST   /auth/lock-screen               — Lock session
POST   /auth/unlock                    — Unlock with PIN/password
GET    /auth/me                        — Get current user profile
```

> **Note:** `POST /auth/register` (customer self-registration) is NOT implemented.

### 7.3 Users Module

> **Driver Account Creation:** `POST /users` with `role=Driver` is the **only** way to create driver accounts. The system automatically provisions a `drivers` profile record in the same transaction.

```
GET    /users                          — List all users [ADMIN]
POST   /users                          — Create user (Admin, OPS, or Driver) [ADMIN]
GET    /users/:id                      — Get user by ID [ADMIN]
PUT    /users/:id                      — Update user details [ADMIN]
PATCH  /users/:id/status               — Toggle user status (Active/Inactive) [ADMIN]
DELETE /users/:id                      — Delete user [ADMIN]
GET    /users/roles                    — Get available roles [ADMIN]
```

**POST /users — Driver creation body example:**
```json
{
  "name": "David Wilson",
  "username": "david.wilson",
  "email": "david@novadrive.com",
  "phone": "(555) 321-4567",
  "role": "Driver",
  "status": "Active",
  "password": "securePassword123",
  "driverProfile": {
    "hireDate": "2025-04-12",
    "licenseNumber": "DL-908234-A",
    "commercialLicenseNumber": "CDL-40918-B",
    "licenseExpiryDate": "2027-05-15",
    "address": "128 Beverly Dr, Beverly Hills, CA",
    "emergencyContactName": "Linda Wilson",
    "emergencyContactPhone": "(555) 321-9988"
  }
}
```

### 7.4 Drivers Module

> **Scope:** Operational management only. No driver creation endpoint. Driver data is seeded via `POST /users`.

```
GET    /drivers                        — List all drivers [ADMIN, OPS]
GET    /drivers/:id                    — Get driver operational profile [ADMIN, OPS]
PUT    /drivers/:id                    — Update driver operational data [ADMIN]
PATCH  /drivers/:id/availability       — Update availability status [ADMIN, OPS, DRIVER(self)]
GET    /drivers/:id/assignments        — Driver's delivery list [ADMIN, OPS, DRIVER(self)]
GET    /drivers/:id/documents          — Compliance document vault [ADMIN, OPS]
POST   /drivers/:id/documents          — Upload compliance document [ADMIN]
PATCH  /drivers/:id/documents/:docId   — Update document status [ADMIN]
GET    /drivers/:id/incidents          — Driver incident log [ADMIN, OPS]
POST   /drivers/:id/incidents          — Log new incident [ADMIN, OPS, DRIVER]
PATCH  /drivers/:id/incidents/:incId   — Update incident resolution [ADMIN, OPS]
GET    /drivers/:id/timeline           — Activity timeline [ADMIN, OPS]
GET    /drivers/:id/performance        — Performance metrics [ADMIN, OPS]
GET    /drivers/available              — Available drivers list [ADMIN, OPS]
GET    /drivers/me                     — Current driver's own profile [DRIVER]
```

### 7.5 Vehicles Module

```
GET    /vehicles                       — Full fleet list [ADMIN, OPS, DRIVER]
POST   /vehicles                       — Add vehicle [ADMIN]
GET    /vehicles/:id                   — Vehicle detail [ADMIN, OPS]
PUT    /vehicles/:id                   — Update vehicle [ADMIN]
DELETE /vehicles/:id                   — Remove vehicle [ADMIN]
PATCH  /vehicles/:id/status            — Update status [ADMIN, OPS]
GET    /vehicles/:id/documents         — Vehicle docs [ADMIN, OPS]
POST   /vehicles/:id/documents         — Upload doc [ADMIN]
GET    /vehicles/:id/maintenance       — Maintenance history [ADMIN, OPS]
POST   /vehicles/:id/maintenance       — Log maintenance [ADMIN, OPS]
GET    /vehicles/:id/inspections       — Inspection reports [ADMIN, OPS]
GET    /vehicles/available             — Available vehicles [ADMIN, OPS]
GET    /vehicles/fleet-summary         — KPI summary [ADMIN, OPS]
```

### 7.6 Bookings Module

```
GET    /bookings                       — All bookings [ADMIN, OPS]
POST   /bookings                       — Create booking [ADMIN]
GET    /bookings/:id                   — Booking detail [ADMIN, OPS]
PUT    /bookings/:id                   — Update booking [ADMIN]
DELETE /bookings/:id                   — Cancel booking [ADMIN]

# License
PATCH  /bookings/:id/verify-license    — Approve/reject license [ADMIN]

# Workflow Actions
PATCH  /bookings/:id/send-contract     — Send contract [ADMIN]
PATCH  /bookings/:id/sign-contract     — Mark as signed (by admin on behalf) [ADMIN]
PATCH  /bookings/:id/void-contract     — Void contract [ADMIN]
PATCH  /bookings/:id/record-payment    — Record payment [ADMIN]
PATCH  /bookings/:id/assign-driver     — Assign driver [ADMIN, OPS]
PATCH  /bookings/:id/schedule-delivery — Set delivery date/address [ADMIN, OPS]
PATCH  /bookings/:id/mark-in-transit   — Mark vehicle in transit [ADMIN, OPS]
PATCH  /bookings/:id/mark-delivered    — Mark delivered with inspection [ADMIN, OPS, DRIVER]
PATCH  /bookings/:id/mark-returned     — Mark returned with inspection [ADMIN, OPS, DRIVER]
PATCH  /bookings/:id/complete          — Complete booking [ADMIN]
PATCH  /bookings/:id/cancel            — Cancel booking [ADMIN]

# Sub-resources
GET    /bookings/:id/timeline          — Lifecycle timeline [ADMIN, OPS]
GET    /bookings/:id/communications    — Communication log [ADMIN, OPS]
POST   /bookings/:id/communications    — Log communication [ADMIN, OPS]
GET    /bookings/:id/notes             — Internal notes [ADMIN, OPS]
POST   /bookings/:id/notes             — Add note [ADMIN, OPS]
GET    /bookings/:id/reminders         — Follow-up reminders [ADMIN, OPS]
POST   /bookings/:id/reminders         — Create reminder [ADMIN, OPS]
GET    /bookings/:id/risk-profile      — Risk data [ADMIN]
GET    /bookings/customer/:customerId  — All bookings for a customer [ADMIN]
GET    /bookings/stats                 — Dashboard KPIs [ADMIN, OPS]
```

### 7.7 Contracts Module

```
GET    /contracts                      — All contracts [ADMIN]
GET    /contracts/:id                  — Contract detail [ADMIN]
PATCH  /contracts/:id/send             — Send to customer [ADMIN]
PATCH  /contracts/:id/resend           — Resend [ADMIN]
PATCH  /contracts/:id/sign             — Mark signed (admin records signature) [ADMIN]
PATCH  /contracts/:id/void             — Void [ADMIN]
PATCH  /contracts/:id/archive          — Archive [ADMIN]
PATCH  /contracts/:id/restore          — Restore [ADMIN]
GET    /contracts/:id/timeline         — Contract history [ADMIN]
GET    /contracts/:id/pdf              — Generate PDF [ADMIN]
GET    /contracts/booking/:bookingId   — Contract by booking [ADMIN]
GET    /contracts/stats                — Contract KPIs [ADMIN]
```

### 7.8 Payments Module

> All payments are manually recorded by ADMIN. No payment gateway integration.

```
GET    /payments                       — All payments [ADMIN]
GET    /payments/:id                   — Payment detail [ADMIN]
POST   /payments                       — Record payment [ADMIN]
PATCH  /payments/:id/refund            — Issue refund [ADMIN]

GET    /invoices                       — All invoices [ADMIN]
GET    /invoices/:id                   — Invoice detail [ADMIN]
POST   /invoices/:id/generate-pdf      — Generate invoice PDF [ADMIN]

GET    /deposits                       — All deposits [ADMIN]
PATCH  /deposits/:id/release           — Release deposit [ADMIN]
PATCH  /deposits/:id/forfeit           — Forfeit deposit [ADMIN]

GET    /refunds                        — All refunds [ADMIN]

GET    /payments/stats                 — Finance KPIs [ADMIN]
GET    /payments/booking/:bookingId    — Payments for booking [ADMIN]
```

### 7.9 Deliveries Module

```
GET    /deliveries                     — All deliveries [ADMIN, OPS]
GET    /deliveries/:id                 — Delivery detail [ADMIN, OPS, DRIVER(assigned)]
PATCH  /deliveries/:id/assign-driver   — Assign driver [ADMIN, OPS]
PATCH  /deliveries/:id/accept          — Driver accepts [DRIVER]
PATCH  /deliveries/:id/reject          — Driver rejects with reason [DRIVER]
PATCH  /deliveries/:id/start-navigation— Driver starts navigation [DRIVER]
PATCH  /deliveries/:id/mark-arrived    — Driver arrives at location [DRIVER]
PATCH  /deliveries/:id/complete-inspection — Inspection done [ADMIN, OPS, DRIVER]
PATCH  /deliveries/:id/start-trip      — Begin trip [DRIVER]
PATCH  /deliveries/:id/complete-trip   — Trip done [DRIVER]
PATCH  /deliveries/:id/schedule-return — Schedule return [ADMIN, OPS]
POST   /deliveries/:id/inspection      — Submit inspection report [ADMIN, OPS, DRIVER]
GET    /deliveries/:id/timeline        — Delivery history [ADMIN, OPS]
GET    /deliveries/driver/:driverId    — Driver's deliveries [ADMIN, OPS, DRIVER(self)]
GET    /deliveries/stats               — Delivery KPIs [ADMIN, OPS]
```

### 7.10 Tasks Module

```
GET    /tasks                          — All tasks [ADMIN, OPS]
POST   /tasks                          — Create task [ADMIN, OPS]
GET    /tasks/:id                      — Task detail [ADMIN, OPS]
PUT    /tasks/:id                      — Update task [ADMIN, OPS]
DELETE /tasks/:id                      — Delete task [ADMIN]
PATCH  /tasks/:id/status               — Update status [ADMIN, OPS]
PATCH  /tasks/:id/assign               — Assign staff [ADMIN, OPS]
GET    /tasks/vehicle/:vehicleId       — Tasks per vehicle [ADMIN, OPS]
GET    /tasks/stats                    — Task KPIs [ADMIN, OPS]
```

### 7.11 Customers Module

> **All customer endpoints are admin-only.** No customer self-service APIs exist.

```
GET    /customers                      — All customers [ADMIN]
POST   /customers                      — Create customer record [ADMIN]
GET    /customers/:id                  — Customer profile [ADMIN]
PUT    /customers/:id                  — Update customer [ADMIN]
PATCH  /customers/:id/kyc              — Update KYC status [ADMIN]
PATCH  /customers/:id/status           — Suspend/activate [ADMIN]
PATCH  /customers/:id/blacklist        — Blacklist customer [ADMIN]
GET    /customers/:id/bookings         — All bookings for customer [ADMIN]
GET    /customers/:id/documents        — KYC documents [ADMIN]
POST   /customers/:id/documents        — Upload KYC document [ADMIN]
GET    /customers/stats                — Customer KPIs [ADMIN]
```

### 7.12 Incidents Module

```
GET    /incidents                      — All incidents [ADMIN, OPS]
POST   /incidents                      — Log incident [ADMIN, OPS, DRIVER(report)]
GET    /incidents/:id                  — Incident detail [ADMIN, OPS]
PATCH  /incidents/:id/status           — Update status [ADMIN, OPS]
PATCH  /incidents/:id/resolve          — Resolve incident [ADMIN, OPS]
PATCH  /incidents/:id/close            — Close incident [ADMIN]
```

### 7.13 Notifications Module

```
GET    /notifications                  — My notifications [ADMIN, OPS, DRIVER]
PATCH  /notifications/:id/read         — Mark as read
PATCH  /notifications/read-all         — Mark all read
DELETE /notifications/:id              — Delete notification
GET    /notifications/preferences      — Get preferences
PUT    /notifications/preferences      — Update preferences
```

### 7.14 Activities Module

```
GET    /activities                     — Global feed [ADMIN, OPS]
GET    /activities/booking/:bookingId  — Per-booking feed [ADMIN, OPS]
```

### 7.15 Reports Module

```
GET    /reports/revenue                — Revenue analytics [ADMIN]
GET    /reports/fleet                  — Fleet utilization [ADMIN]
GET    /reports/bookings               — Booking statistics [ADMIN]
GET    /reports/drivers                — Driver performance [ADMIN, OPS]
GET    /reports/customers              — Customer analytics [ADMIN]
GET    /reports/finance                — Finance summary [ADMIN]
GET    /reports/export                 — Export CSV/PDF [ADMIN]
```

### 7.16 Settings Module

```
GET    /settings                       — Platform settings [ADMIN]
PUT    /settings                       — Update settings [ADMIN]
GET    /settings/locations             — Hub locations [ADMIN]
POST   /settings/locations             — Add hub [ADMIN]
PUT    /settings/locations/:id         — Update hub [ADMIN]
DELETE /settings/locations/:id         — Remove hub [ADMIN]
```

---

## 8. Dashboard Data Flow

### 8.1 Admin Dashboard Data Requirements

**API calls needed to render Admin Dashboard:**

```
GET /bookings/stats         → pendingReservations, activeRentals, pendingContracts
GET /payments/stats         → totalRevenue, pendingPayments
GET /deliveries/stats       → todaysDeliveries, todaysReturns
GET /vehicles/fleet-summary → fleetAvailable, fleetInMaintenance, totalCars
GET /bookings?status=Pending → licensePending count
GET /activities?limit=20    → Live activity feed
GET /reports/revenue?period=H1-2026 → Revenue chart data (monthly)
```

**Quick Action Console writes:**
```
POST   /bookings                       → Create Booking
PATCH  /bookings/:id/send-contract     → Send Contract
PATCH  /bookings/:id/assign-driver     → Assign Driver
PATCH  /deliveries/:id/schedule        → Schedule Delivery
POST   /payments                       → Record Payment (method: Zelle | Cash App | Credit/Debit Card | Pay At Delivery)
```

### 8.2 Operations Dashboard Data Requirements

```
GET /deliveries/stats                → deliveriesToday, returnsToday, vehiclesInTransit
GET /drivers?availability=Available  → availableDrivers
GET /drivers?duty_status=Assigned    → assignedDrivers
GET /vehicles?status=Available       → vehiclesReady
GET /vehicles?status=Maintenance     → vehiclesMaintenance
GET /incidents?status=Open           → openIncidents
GET /tasks?status=Pending            → pendingTasks
GET /activities?role=operations&limit=30 → Live feed
GET /tasks?status=In Progress&limit=4 → Active tasks grid
GET /incidents?status=Open           → Incidents panel
```

**Quick Actions write:**
```
POST   /tasks                          → Create Task
PATCH  /deliveries/:id/assign-driver   → Assign Driver
POST   /deliveries/:id/inspection      → Start Inspection
PATCH  /vehicles/:id/status            → Mark Ready
PATCH  /deliveries/:id/schedule-return → Schedule Return
POST   /incidents                      → Emergency Dispatch
```

### 8.3 Driver Dashboard Data Requirements

```
GET /drivers/me                       → Current driver profile, availability
GET /deliveries/driver/:driverId      → My assignments
GET /deliveries?status=Trip Active&driver=me  → Active trip
GET /deliveries?status=Accepted&driver=me     → Upcoming accepted
GET /deliveries?status=Closed&driver=me       → Completed today
```

**Driver Action writes:**
```
PATCH /deliveries/:id/accept           → Accept Assignment
PATCH /deliveries/:id/reject           → Reject Assignment
PATCH /deliveries/:id/start-navigation → Start Navigation
PATCH /deliveries/:id/mark-arrived     → Mark Arrived
PATCH /deliveries/:id/complete-inspection → Inspection Done
PATCH /deliveries/:id/start-trip       → Start Trip
PATCH /deliveries/:id/complete-trip    → Complete Trip
PATCH /drivers/:id/availability        → Update Status (Online/Busy/Break/Offline)
POST  /incidents                       → Report Emergency
```

> **No Customer Dashboard section.** Customer portal is not implemented.

---

## 9. Module Integration Flow

### 9.1 Driver Account Provisioning (via Users Module)

```
ADMIN: POST /users { role: "Driver", driverProfile: { ... } }
  │
  ├── VALIDATION
  │   ├── Check email uniqueness
  │   ├── Check username uniqueness
  │   └── Validate driverProfile required fields (licenseExpiryDate required)
  │
  ├── DATABASE WRITES (atomic transaction)
  │   ├── INSERT users            (role: DRIVER, status: Active/Pending)
  │   ├── Auto-generate employee_id  (DRV-XXX sequence)
  │   ├── INSERT drivers          (linked via user_id, driver_id_code: drv-XX)
  │   └── INSERT driver_emergency_contacts (if provided)
  │
  ├── NOTIFICATION
  │   └── ADMIN: "Driver account created for David Wilson (DRV-003)"
  │
  └── ACTIVITY LOG
      └── INSERT activities (module: user, "Driver Account David Wilson Created")
```

### 9.2 Booking Creation Cascade

```
ADMIN: POST /bookings
  │
  ├── VALIDATION
  │   ├── Check customer not suspended/blacklisted (GET /customers/:id)
  │   ├── Check vehicle available (vehicles.status = Available)
  │   └── Conflict check: no overlapping active bookings for same vehicle
  │
  ├── DATABASE WRITES (atomic transaction)
  │   ├── INSERT bookings                    (status: Pending Review)
  │   ├── INSERT booking_risk_profiles       (riskLevel: Low)
  │   ├── INSERT booking_timeline            (Booking Created)
  │   ├── INSERT booking_activity_logs       (Booking Created)
  │   ├── UPDATE vehicles.status             → Reserved
  │   ├── INSERT contracts                   (status: Draft)
  │   ├── INSERT payments                    (status: Pending)
  │   ├── INSERT invoices                    (status: Sent)
  │   ├── INSERT deposits                    (status: Pending)
  │   └── INSERT deliveries                  (status: Not Scheduled)
  │
  ├── NOTIFICATIONS
  │   └── ADMIN users: "New booking RSV-XXXX created"
  │
  └── ACTIVITY LOG
      └── INSERT activities (module: booking, "Booking RSV-XXXX Initiated")
```

### 9.3 Full Booking Lifecycle (12 Stages)

```
Stage 1: PENDING REVIEW
  → ADMIN: verifyLicense(approve)
  → UPDATE bookings.license_status = Verified
  → UPDATE bookings.status = License Verified
  → Notify admin team: "License Approved for [Customer]"

Stage 2: LICENSE VERIFIED
  → ADMIN: sendContract()
  → UPDATE bookings.contract_status = Sent
  → UPDATE bookings.status = Contract Sent
  → UPDATE contracts.status = Sent, signature_status = Sent

Stage 3: CONTRACT SENT
  → ADMIN: signContract() [records customer physical/digital signature]
  → UPDATE bookings.contract_status = Signed
  → UPDATE bookings.status = Contract Signed
  → UPDATE contracts.status = Signed, signed_date = now

Stage 4: CONTRACT SIGNED
  → ADMIN: recordPayment(amount, method, transactionId)
    method ∈ { Credit/Debit Card, Zelle, Cash App, Pay At Delivery }
  → UPDATE bookings.payment_status = Paid
  → UPDATE bookings.status = Payment Completed
  → UPDATE payments.status = Paid
  → UPDATE invoices.status = Paid
  → UPDATE deposits.status = Held
  → UPDATE vehicles.status = Reserved (locked)

Stage 5: PAYMENT COMPLETED
  → ADMIN/OPS: assignDriver(driverId)
  → UPDATE bookings.driver_id, driver_name
  → UPDATE bookings.status = Driver Assigned
  → UPDATE deliveries.driver_id, driver_name, status = Driver Assigned
  → UPDATE drivers.duty_status = Assigned
  → Notify driver: "New assignment RSV-XXXX"

Stage 6: DRIVER ASSIGNED
  → ADMIN/OPS: scheduleDelivery(address, dateTime)
  → UPDATE deliveries.delivery_address, schedule_date, status = Scheduled
  → UPDATE bookings.delivery_status = Scheduled
  → UPDATE bookings.status = Delivery Scheduled

Stage 7: DELIVERY SCHEDULED
  → DRIVER: acceptAssignment()
  → UPDATE deliveries.status = Accepted
  → DRIVER: startNavigation()
  → UPDATE deliveries.status = En Route
  → ADMIN/OPS: markInTransit()
  → UPDATE deliveries.status = In Transit
  → UPDATE bookings.delivery_status = In Transit
  → UPDATE bookings.status = In Transit
  → UPDATE vehicles.status = Active Rental

Stage 8: IN TRANSIT
  → DRIVER: markArrived()
  → UPDATE deliveries.status = Arrived
  → DRIVER: completeInspection (pre-delivery)
  → POST /deliveries/:id/inspection (stage: out)
  → INSERT vehicle_inspection_reports (stage: out)
  → UPDATE deliveries.status = Inspection Complete
  → UPDATE bookings.inspection_out_id

Stage 9: INSPECTION COMPLETE
  → DRIVER: startTrip()
  → UPDATE deliveries.status = Trip Active

Stage 10: DELIVERED (ACTIVE RENTAL)
  → ADMIN/OPS: scheduleReturn(returnDate, returnLocation, returnDriverId)
  → UPDATE deliveries.return_date, return_location, return_driver_id
  → UPDATE deliveries.status = Return Scheduled
  → DRIVER: completeTrip()
  → UPDATE deliveries.status = Returned
  → UPDATE bookings.status = Active Rental → then Returned

Stage 11: RETURNED
  → ADMIN/OPS: completeInspection(stage: in)
  → POST /deliveries/:id/inspection (stage: in)
  → INSERT vehicle_inspection_reports (stage: in)
  → UPDATE deliveries.status = Closed
  → UPDATE bookings.inspection_in_id
  → UPDATE vehicles.status = Available
  → If damage: additionalCharges → INSERT new payment record

Stage 12: COMPLETED
  → UPDATE bookings.status = Completed
  → UPDATE deliveries.status = Closed
  → UPDATE deposits.status = Released
  → UPDATE drivers.deliveries_count + 1
  → UPDATE customers.total_rentals + 1
  → UPDATE vehicles.trips_count + 1
```

### 9.4 Driver Trip State Machine

```
New Assignment created
  ↓
ASSIGNED (Driver Assigned by admin)
  ↓ [driver.acceptAssignment()]
ACCEPTED
  ↓ [driver.startNavigation()]
EN_ROUTE
  ↓ [driver.markArrived()]
ARRIVED
  ↓ [driver completes pre-delivery inspection]
INSPECTION_COMPLETE
  ↓ [driver.startTrip()]
TRIP_ACTIVE
  ↓ [driver.completeTrip()]
DELIVERED / COMPLETED

  ─── REJECTED ──→ Unassign, notify ADMIN/OPS, re-assign another driver
```

### 9.5 Payment → Deposit Lifecycle

```
Booking Created
  → Deposit: Pending (not yet collected)

Payment Received — recordPayment(method: Zelle | Cash App | Credit/Debit Card | Pay At Delivery)
  → Deposit: Held (actively secured)
  → Payment: Paid

Return + Post-Return Inspection
  → No damage: Deposit Released (ADMIN: releaseDeposit)
  → Damage found: Deposit Forfeited + new Damage Charge payment created

Refund needed (ADMIN: refundPayment)
  → New Refund record created (method matches original payment method)
  → Payment status → Refunded
```

### 9.6 Finance Module Integration

The Finance module aggregates across:

```
payments     → Total revenue by method, pending, refunds by period
invoices     → Outstanding, paid, overdue
deposits     → Held, released, forfeited amounts
refunds      → Total refunds issued
bookings     → Booking volumes, cancellations
vehicles     → Per-vehicle revenue (vehicles.revenue_total)
customers    → LTV (customers.total_spent)
```

**Payment method breakdown available:**
```
Revenue by Zelle       → SUM(payments.amount WHERE method = 'Zelle')
Revenue by Cash App    → SUM(payments.amount WHERE method = 'Cash App')
Revenue by Card        → SUM(payments.amount WHERE method = 'Credit/Debit Card')
Revenue by Delivery    → SUM(payments.amount WHERE method = 'Pay At Delivery')
```

---

## 10. Module Dependency Map

```
                    ┌─────────────────────────────┐
                    │          USERS               │
                    │   (Admin, OPS, Driver only)  │
                    │   Driver creation here only  │
                    └──────────┬──────────────────┘
                               │
           ┌────────────────────┼─────────────────────┐
           ▼                    ▼                       ▼
     ┌──────────┐        ┌──────────┐          ┌──────────────┐
     │ DRIVERS  │        │CUSTOMERS │          │   VEHICLES   │
     │(ops only)│        │(admin    │          │              │
     │no create │        │ managed) │          │              │
     └────┬─────┘        └────┬─────┘          └──────┬───────┘
          │                   │                        │
          └──────────┬────────┘                        │
                     ▼                                  │
               ┌──────────┐◄──────────────────────────┘
               │ BOOKINGS │  ← CENTRAL MODULE
               └────┬─────┘
           ┌────────┼────────┬────────────┐
           ▼        ▼        ▼            ▼
     ┌──────────┐ ┌────┐ ┌───────┐ ┌───────────┐
     │CONTRACTS │ │PMTS│ │DELIV. │ │  TASKS    │
     └──────────┘ └────┘ └───────┘ └───────────┘
           │        │        │
           ▼        ▼        ▼
     ┌─────────────────────────────┐
     │       NOTIFICATIONS         │
     │       ACTIVITIES            │
     │       INCIDENTS             │
     └─────────────────────────────┘
```

**Dependency rules:**
- `USERS` is the entry point for all staff accounts. DRIVER role auto-provisions `DRIVERS` record
- `DRIVERS` depends on: `USERS` (account provisioned there)
- `CUSTOMERS` is standalone — no user auth dependency
- `BOOKINGS` depends on: `USERS`, `CUSTOMERS`, `VEHICLES`, `DRIVERS`
- `CONTRACTS` depends on: `BOOKINGS`, `CUSTOMERS`, `VEHICLES`
- `PAYMENTS` depends on: `BOOKINGS`, `CUSTOMERS`
- `DELIVERIES` depends on: `BOOKINGS`, `DRIVERS`, `VEHICLES`
- `TASKS` depends on: `VEHICLES` (optional), `BOOKINGS` (optional)
- `NOTIFICATIONS` depends on: ALL modules (subscriber)
- `ACTIVITIES` depends on: ALL modules (global log)
- `INCIDENTS` depends on: `BOOKINGS`, `VEHICLES`, `DRIVERS`, `CUSTOMERS` (loose)

---

## Appendix: Database Design Notes

### Indexing Strategy (Critical Columns)

```sql
-- bookings: most-queried table
INDEX idx_bookings_status       ON bookings(status);
INDEX idx_bookings_customer     ON bookings(customer_id);
INDEX idx_bookings_vehicle      ON bookings(vehicle_id);
INDEX idx_bookings_driver       ON bookings(driver_id);
INDEX idx_bookings_dates        ON bookings(start_date, end_date);

-- deliveries: driver dashboard
INDEX idx_deliveries_driver     ON deliveries(driver_id);
INDEX idx_deliveries_status     ON deliveries(status);
INDEX idx_deliveries_booking    ON deliveries(booking_id);

-- drivers: operations dashboard
INDEX idx_drivers_user          ON drivers(user_id);
INDEX idx_drivers_availability  ON drivers(availability);
INDEX idx_drivers_duty_status   ON drivers(duty_status);

-- notifications: per-user
INDEX idx_notifications_user    ON notifications(user_id, is_read);

-- payments
INDEX idx_payments_booking      ON payments(booking_id);
INDEX idx_payments_customer     ON payments(customer_id);
INDEX idx_payments_method       ON payments(method);
```

### Soft Delete Strategy

All financial records (payments, contracts, invoices, deposits) use **status fields** instead of hard DELETE operations. Only users and tasks support deletion.

### Audit Trail Requirement

Every state change must:
1. Update the entity's `updated_at` timestamp
2. Insert into the relevant `_timeline` table
3. Insert into `activities` global log
4. Trigger relevant `notifications` to affected staff

### Payment Recording Strategy

Since no payment gateway is integrated, all payments are:
- Manually entered by ADMIN
- `transaction_id` is optional (e.g., Zelle reference number, Cash App payment ID)
- `Pay At Delivery` payments are pre-recorded as Pending, confirmed by ADMIN on handover

---

*Document version: 1.1 (Corrected) | Updated: 2026-06-13 | Matches frontend: NOVA DRIVE Frontend V.3.0*
*Corrections: Stripe removed · Customer Portal removed · Driver creation moved to Users module*
