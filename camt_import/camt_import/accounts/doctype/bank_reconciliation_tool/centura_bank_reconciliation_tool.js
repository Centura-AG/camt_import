// Copyright (c) 2024, Centura AG and contributors
// For license information, please see license.txt

frappe.ui.form.on('Bank Reconciliation Tool', {
    refresh: function (frm) {
        frm.add_custom_button(__('Import Data from Camt-File'), () => {
            frappe.prompt({
                label: 'Attach Camt-File',
                fieldtype: 'Attach',
                fieldname: 'file',
                reqd: 1
            }, (values) => {
                frappe.call({
                    method: 'camt_import.camt_import.accounts.doctype.bank_reconciliation_tool.centura_bank_reconciliation_tool.import_camt',
                    args: {
                        xml_file: values.file,
                        company: frm.doc.company,
                        bank_account: frm.doc.bank_account
                    },
                    callback: function (r) {
                        if (!r.exc) {
                            frappe.msgprint(__('camt File Imported Successfully'));
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
