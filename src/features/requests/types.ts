export type MobileRequestSetup = {
  trip: { name: string; company: string };
  driver: { name: string; employee?: string };
  employee?: { name: string; employee_name?: string; company?: string };
  expense_types: string[];
  warehouses: { name: string; warehouse_name?: string }[];
  permissions: { expense_claim: boolean; material_request: boolean };
};

export type MaterialRequestItemOption = {
  name: string;
  item_name?: string;
  stock_uom: string;
};

export type CreatedMobileRequest = {
  doctype: 'Expense Claim' | 'Material Request';
  name: string;
  status: string;
  created: boolean;
};

export type MobileRequestHistoryItem = {
  doctype: 'Expense Claim' | 'Material Request';
  name: string;
  status: string;
  document_status?: string;
  date?: string;
  modified?: string;
  delivery_trip?: string;
  amount?: number;
  currency?: string;
  purpose?: string;
  item_count?: number;
};

export type MobileRequestDetail = MobileRequestHistoryItem & {
  items: {
    item_code?: string;
    item_name?: string;
    qty?: number;
    uom?: string;
    warehouse?: string;
    schedule_date?: string;
    expense_type?: string;
    expense_date?: string;
    description?: string;
    amount?: number;
    sanctioned_amount?: number;
  }[];
};
