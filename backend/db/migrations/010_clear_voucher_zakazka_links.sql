UPDATE vouchers
SET zakazka_id = NULL,
    title = kod
WHERE zakazka_id IS NOT NULL
   OR title IS DISTINCT FROM kod;
