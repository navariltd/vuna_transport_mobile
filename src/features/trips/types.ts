export type MobileAddress = {
  name: string;
  address_title?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  pincode?: string;
  phone?: string;
  email_id?: string;
};

export type MobileContact = {
  name: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  mobile_no?: string;
  email_id?: string;
};

export type DeliveryStop = {
  name: string;
  idx: number;
  customer?: string;
  address?: string;
  customer_address?: string;
  contact?: string;
  customer_contact?: string;
  delivery_note?: string;
  visited: number;
  estimated_arrival?: string;
  lat?: number;
  lng?: number;
  coordinate_source?: string;
  details?: string;
  delivery_status?: string;
  can_arrive?: boolean;
  can_complete_delivery?: boolean;
  requires_trip_start?: boolean;
  address_details?: MobileAddress;
  contact_details?: MobileContact;
  proof_of_delivery?: {
    name: string;
    status: string;
    docstatus: number;
    delivery_datetime?: string;
  };
};

export type DeliveryTrip = {
  name: string;
  status: string;
  erpnext_status?: string;
  company?: string;
  vehicle?: string;
  driver?: string;
  departure_time?: string;
  total_distance?: number;
  uom?: string;
  stop_count: number;
  completed_stop_count: number;
  next_stop?: string;
  actual_start?: string;
  actual_completion?: string;
  actions?: {
    can_start: boolean;
    can_report_incident: boolean;
  };
  stops: DeliveryStop[];
};

export type VehicleIncidentSummary = {
  name: string;
  incident_type: string;
  incident_datetime: string;
  severity: string;
  description: string;
  resolution_status: string;
  resolution?: string;
  resolved_on?: string;
  vehicle_immobilized: number;
  cargo_affected: number;
  driver_affected: number;
  latitude?: number;
  longitude?: number;
  docstatus: number;
};

export type MobileTripIncidents = {
  trip: { name: string; vehicle: string };
  incident_types: string[];
  severities: string[];
  incidents: VehicleIncidentSummary[];
};

export type DeliveryNoteItem = {
  name: string;
  item_code: string;
  item_name?: string;
  description?: string;
  qty: number;
  uom: string;
  stock_qty: number;
  stock_uom: string;
  batch_no?: string;
};

export type DeliveryNoteDetails = {
  trip: {
    name: string;
    status: string;
    erpnext_status?: string;
    vehicle?: string;
    actual_start?: string;
    actual_completion?: string;
    actions?: DeliveryTrip['actions'];
  };
  stop: DeliveryStop;
  delivery_note: {
    name: string;
    customer: string;
    customer_name?: string;
    posting_date?: string;
    posting_time?: string;
    status: string;
    currency?: string;
    grand_total?: number;
    items: DeliveryNoteItem[];
  };
};

export type PODItem = {
  name: string;
  delivery_note_item?: string;
  item_code: string;
  item_name?: string;
  ordered_qty: number;
  delivered_qty: number;
  rejected_qty: number;
  uom: string;
  rejection_reason?: string;
  rejection_reason_remarks?: string;
  batch_no?: string;
};

export type ProofOfDeliveryDraft = {
  name: string;
  request_id?: string;
  docstatus: number;
  status: string;
  delivery_trip: string;
  delivery_stop: string;
  delivery_note: string;
  customer: string;
  delivery_address: string;
  delivery_datetime?: string;
  received_by?: string;
  receiver_phone?: string;
  exception_reason?: string;
  remarks?: string;
  notes?: string;
  signature?: string;
  delivery_photo?: string;
  rejection_reasons: string[];
  exception_reasons: string[];
  items: PODItem[];
};
