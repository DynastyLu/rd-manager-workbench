process.env.NODE_ENV = 'test';
process.env.SERVICE_NAME = 'rd-manager-workbench';
process.env.INSTANCE_ID = 'e2e';
process.env.HOST = '127.0.0.1';
process.env.DATABASE_URL =
  'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench_test?schema=app';
