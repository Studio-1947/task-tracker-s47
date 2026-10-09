ALTER TABLE "attendance_records" ADD COLUMN "automatic_half_day_leave_id" uuid REFERENCES "leave_requests"("id") ON DELETE set null;
