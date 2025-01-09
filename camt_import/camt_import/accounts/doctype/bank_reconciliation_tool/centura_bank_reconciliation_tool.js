// Copyright (c) 2024, Centura AG and contributors
// For license information, please see license.txt

frappe.ui.form.on('Bank Reconciliation Tool', {
    refresh: function (frm) {
        frm.add_custom_button(__('Import Data from camt-File'), () => {
            frappe.prompt({
                label: 'Attach camt-File (ZIP or XML File)',
                fieldtype: 'Attach',
                fieldname: 'file',
                reqd: 1
            }, (values) => {
                frappe.call({
                    method: 'camt_import.camt_import.accounts.doctype.bank_reconciliation_tool.centura_bank_reconciliation_tool.import_camt',
                    args: {
                        file: values.file,
                        company: frm.doc.company,
                        bank_account: frm.doc.bank_account
                    },
                    callback: function (r) {
                        if (!r.exc) {
                            frappe.msgprint(__('camt File Import started'));
                            frm.refresh();
                        }
                    },
                    error: function (r) {
                        frappe.msgprint({
                            title: __('Error'),
                            message: r.message || __('An error occurred'),
                            indicator: 'red'
                        });
                    }
                });
            });
        });
    }
});
