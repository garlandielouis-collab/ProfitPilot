'use server';

// Re-export from the unified customers module.
// This file exists for backward compatibility with existing imports.

export { getCustomers as getClients, upsertCustomer as upsertClient, deleteCustomer as deleteClient, markCustomerCreditPaid as markClientCreditPaid, type Customer as Client } from './customers';
