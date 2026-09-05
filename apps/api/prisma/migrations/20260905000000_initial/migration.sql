-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BatteryCategory" AS ENUM ('EV', 'LMT', 'INDUSTRIAL_GT_2KWH');

-- CreateEnum
CREATE TYPE "PassportState" AS ENUM ('draft', 'data_collection', 'validation_failed', 'ready', 'published', 'registry_pending', 'registered', 'updated', 'superseded', 'recycled');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('unvalidated', 'submitted', 'validated', 'rejected', 'superseded');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('pending_upload', 'uploaded', 'unverified', 'verified', 'rejected', 'superseded');

-- CreateEnum
CREATE TYPE "SupplierRequestStatus" AS ENUM ('draft', 'sent', 'opened', 'partially_submitted', 'submitted', 'accepted', 'rejected', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "RegistryActorType" AS ENUM ('economic_operator', 'value_chain_actor');

-- CreateEnum
CREATE TYPE "RegistryVerificationStatus" AS ENUM ('unverified', 'pending', 'verified', 'expired', 'rejected');

-- CreateEnum
CREATE TYPE "RegistryStatus" AS ENUM ('draft', 'blocked', 'registry_pending', 'registered', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'responsible_economic_operator',
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "registryIdentifierType" TEXT,
    "registryIdentifierValue" TEXT,
    "vatNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistryEnrolmentProfile" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'legal_person',
    "legalName" TEXT NOT NULL,
    "streetAddress" TEXT NOT NULL,
    "postOfficeBox" TEXT,
    "extendedAddress" TEXT,
    "locality" TEXT,
    "postalCode" TEXT,
    "region" TEXT,
    "countryOfRegistration" TEXT NOT NULL,
    "identifierType" TEXT NOT NULL,
    "identifierValue" TEXT NOT NULL,
    "complianceEmail" TEXT NOT NULL,
    "compliancePhoneCountryCode" TEXT NOT NULL,
    "compliancePhone" TEXT NOT NULL,
    "legalRepresentativeFirstName" TEXT NOT NULL,
    "legalRepresentativeLastName" TEXT NOT NULL,
    "legalRepresentativeEmail" TEXT NOT NULL,
    "qsealSubjectJson" JSONB,
    "declarationObjectKey" TEXT,
    "declarationSha256" TEXT,
    "applicationStatus" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryEnrolmentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistryIdentity" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "actorType" "RegistryActorType" NOT NULL,
    "status" "RegistryVerificationStatus" NOT NULL DEFAULT 'unverified',
    "registryActorIdentifier" TEXT,
    "verificationMethod" TEXT,
    "electronicIdExpiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "qsealCertificateFingerprint" TEXT,
    "evidenceObjectKey" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "externalSubject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'operator_user',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WrittenAuthorisation" (
    "id" TEXT NOT NULL,
    "responsibleOperatorId" TEXT NOT NULL,
    "serviceProviderId" TEXT NOT NULL,
    "scopeJson" JSONB NOT NULL,
    "documentObjectKey" TEXT NOT NULL,
    "documentSha256" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WrittenAuthorisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatteryModel" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "modelIdentifier" TEXT NOT NULL,
    "category" "BatteryCategory" NOT NULL,
    "name" TEXT,
    "chemistry" TEXT,
    "applicabilityContext" JSONB NOT NULL DEFAULT '{}',
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatteryModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatteryItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "serialOrItemIdentifier" TEXT NOT NULL,
    "batchIdentifier" TEXT,
    "upi" TEXT,
    "manufactureDate" TIMESTAMP(3),
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'original',
    "passportState" "PassportState" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatteryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryRuleSet" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveUntil" TIMESTAMP(3),
    "sourceUri" TEXT,
    "sourceHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldDefinition" (
    "id" TEXT NOT NULL,
    "fieldNumber" INTEGER NOT NULL,
    "ruleSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalSource" TEXT NOT NULL,
    "accessTier" TEXT NOT NULL,
    "dataNature" TEXT NOT NULL,
    "applicabilityJson" JSONB NOT NULL,
    "validationSchema" JSONB,
    "note" TEXT,

    CONSTRAINT "FieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassportValue" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "modelId" TEXT,
    "batteryItemId" TEXT,
    "fieldDefinitionId" INTEGER NOT NULL,
    "valueJson" JSONB NOT NULL,
    "unit" TEXT,
    "sourceKind" TEXT NOT NULL DEFAULT 'operator',
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'unvalidated',
    "approvedByUserId" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "supersedesValueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassportValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceObject" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "supplierId" TEXT,
    "objectKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "sha256" TEXT,
    "storageChecksum" TEXT,
    "evidenceType" TEXT NOT NULL,
    "verificationStatus" "EvidenceStatus" NOT NULL DEFAULT 'pending_upload',
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceLink" (
    "evidenceId" TEXT NOT NULL,
    "passportValueId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'supports',
    "locatorJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceLink_pkey" PRIMARY KEY ("evidenceId","passportValueId")
);

-- CreateTable
CREATE TABLE "ExtractionJob" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'queued',
    "requestJson" JSONB,
    "responseJson" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedClaim" (
    "id" TEXT NOT NULL,
    "extractionJobId" TEXT NOT NULL,
    "passportValueId" TEXT,
    "fieldDefinitionId" INTEGER NOT NULL,
    "proposedValue" JSONB NOT NULL,
    "proposedUnit" TEXT,
    "confidence" DOUBLE PRECISION,
    "locatorJson" JSONB,
    "state" TEXT NOT NULL DEFAULT 'suggested',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "externalReference" TEXT,
    "countryCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRequest" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "SupplierRequestStatus" NOT NULL DEFAULT 'draft',
    "requestedBySubject" TEXT NOT NULL,
    "message" TEXT,
    "dueAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRequestField" (
    "id" TEXT NOT NULL,
    "supplierRequestId" TEXT NOT NULL,
    "fieldDefinitionId" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "SupplierRequestField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierSubmission" (
    "id" TEXT NOT NULL,
    "supplierRequestId" TEXT NOT NULL,
    "fieldDefinitionId" INTEGER NOT NULL,
    "valueJson" JSONB NOT NULL,
    "unit" TEXT,
    "attestationText" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierSubmissionEvidence" (
    "supplierSubmissionId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,

    CONSTRAINT "SupplierSubmissionEvidence_pkey" PRIMARY KEY ("supplierSubmissionId","evidenceId")
);

-- CreateTable
CREATE TABLE "ComplianceCheck" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "modelId" TEXT,
    "batteryItemId" TEXT,
    "ruleSetId" TEXT,
    "ruleCode" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detailsJson" JSONB NOT NULL DEFAULT '{}',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassportVersion" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "batteryItemId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT 'eubatterypassport.v2',
    "ruleSetVersion" TEXT NOT NULL,
    "canonicalJson" JSONB NOT NULL,
    "sha256" TEXT NOT NULL,
    "previousVersionHash" TEXT,
    "publicationState" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassportVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicPassportSnapshot" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "batteryItemId" TEXT NOT NULL,
    "passportVersionId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "upi" TEXT NOT NULL,
    "publicJson" JSONB NOT NULL,
    "sha256" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicPassportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrySubmission" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "batteryItemId" TEXT NOT NULL,
    "passportVersionId" TEXT,
    "method" TEXT NOT NULL,
    "correlationId" TEXT,
    "registryUri" TEXT,
    "status" "RegistryStatus" NOT NULL DEFAULT 'draft',
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorReport" JSONB,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "batteryItemId" TEXT,
    "granteeSubject" TEXT NOT NULL,
    "tokenHash" TEXT,
    "granteeRole" TEXT NOT NULL,
    "accessTier" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "grantedBySubject" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifecycleEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "batteryItemId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "previousPassportId" TEXT,
    "integrityHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryReading" (
    "id" BIGSERIAL NOT NULL,
    "organisationId" TEXT NOT NULL,
    "batteryItemId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT,
    "payload" JSONB,
    "source" TEXT,
    "integrityHash" TEXT,

    CONSTRAINT "TelemetryReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "organisationId" TEXT,
    "actorSubject" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "beforeHash" TEXT,
    "afterHash" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "requestId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseJson" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistryEnrolmentProfile_organisationId_key" ON "RegistryEnrolmentProfile"("organisationId");

-- CreateIndex
CREATE INDEX "RegistryIdentity_status_validUntil_idx" ON "RegistryIdentity"("status", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "RegistryIdentity_organisationId_actorType_key" ON "RegistryIdentity"("organisationId", "actorType");

-- CreateIndex
CREATE INDEX "User_externalSubject_idx" ON "User"("externalSubject");

-- CreateIndex
CREATE UNIQUE INDEX "User_organisationId_externalSubject_key" ON "User"("organisationId", "externalSubject");

-- CreateIndex
CREATE UNIQUE INDEX "User_organisationId_email_key" ON "User"("organisationId", "email");

-- CreateIndex
CREATE INDEX "WrittenAuthorisation_responsibleOperatorId_validFrom_idx" ON "WrittenAuthorisation"("responsibleOperatorId", "validFrom");

-- CreateIndex
CREATE INDEX "WrittenAuthorisation_serviceProviderId_validFrom_idx" ON "WrittenAuthorisation"("serviceProviderId", "validFrom");

-- CreateIndex
CREATE INDEX "BatteryModel_organisationId_category_idx" ON "BatteryModel"("organisationId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryModel_organisationId_modelIdentifier_key" ON "BatteryModel"("organisationId", "modelIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryItem_publicId_key" ON "BatteryItem"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryItem_upi_key" ON "BatteryItem"("upi");

-- CreateIndex
CREATE INDEX "BatteryItem_organisationId_modelId_idx" ON "BatteryItem"("organisationId", "modelId");

-- CreateIndex
CREATE INDEX "BatteryItem_organisationId_passportState_idx" ON "BatteryItem"("organisationId", "passportState");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryItem_organisationId_serialOrItemIdentifier_key" ON "BatteryItem"("organisationId", "serialOrItemIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryRuleSet_code_version_key" ON "RegulatoryRuleSet"("code", "version");

-- CreateIndex
CREATE INDEX "FieldDefinition_fieldNumber_idx" ON "FieldDefinition"("fieldNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FieldDefinition_ruleSetId_fieldNumber_key" ON "FieldDefinition"("ruleSetId", "fieldNumber");

-- CreateIndex
CREATE INDEX "PassportValue_organisationId_batteryItemId_fieldDefinitionI_idx" ON "PassportValue"("organisationId", "batteryItemId", "fieldDefinitionId");

-- CreateIndex
CREATE INDEX "PassportValue_organisationId_modelId_fieldDefinitionId_idx" ON "PassportValue"("organisationId", "modelId", "fieldDefinitionId");

-- CreateIndex
CREATE INDEX "EvidenceObject_organisationId_verificationStatus_idx" ON "EvidenceObject"("organisationId", "verificationStatus");

-- CreateIndex
CREATE INDEX "EvidenceObject_organisationId_sha256_idx" ON "EvidenceObject"("organisationId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceObject_organisationId_objectKey_key" ON "EvidenceObject"("organisationId", "objectKey");

-- CreateIndex
CREATE INDEX "ExtractionJob_organisationId_status_idx" ON "ExtractionJob"("organisationId", "status");

-- CreateIndex
CREATE INDEX "ExtractedClaim_fieldDefinitionId_state_idx" ON "ExtractedClaim"("fieldDefinitionId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_organisationId_legalName_key" ON "Supplier"("organisationId", "legalName");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierContact_supplierId_email_key" ON "SupplierContact"("supplierId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierRequest_tokenHash_key" ON "SupplierRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "SupplierRequest_organisationId_status_idx" ON "SupplierRequest"("organisationId", "status");

-- CreateIndex
CREATE INDEX "SupplierRequest_supplierId_status_idx" ON "SupplierRequest"("supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierRequestField_supplierRequestId_fieldDefinitionId_key" ON "SupplierRequestField"("supplierRequestId", "fieldDefinitionId");

-- CreateIndex
CREATE INDEX "SupplierSubmission_supplierRequestId_fieldDefinitionId_idx" ON "SupplierSubmission"("supplierRequestId", "fieldDefinitionId");

-- CreateIndex
CREATE INDEX "ComplianceCheck_organisationId_batteryItemId_severity_statu_idx" ON "ComplianceCheck"("organisationId", "batteryItemId", "severity", "status");

-- CreateIndex
CREATE INDEX "PassportVersion_organisationId_batteryItemId_versionNo_idx" ON "PassportVersion"("organisationId", "batteryItemId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "PassportVersion_batteryItemId_versionNo_key" ON "PassportVersion"("batteryItemId", "versionNo");

-- CreateIndex
CREATE INDEX "PublicPassportSnapshot_publicId_active_idx" ON "PublicPassportSnapshot"("publicId", "active");

-- CreateIndex
CREATE INDEX "PublicPassportSnapshot_upi_active_idx" ON "PublicPassportSnapshot"("upi", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PublicPassportSnapshot_passportVersionId_key" ON "PublicPassportSnapshot"("passportVersionId");

-- CreateIndex
CREATE INDEX "RegistrySubmission_organisationId_status_idx" ON "RegistrySubmission"("organisationId", "status");

-- CreateIndex
CREATE INDEX "RegistrySubmission_batteryItemId_createdAt_idx" ON "RegistrySubmission"("batteryItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGrant_tokenHash_key" ON "AccessGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessGrant_organisationId_granteeSubject_accessTier_idx" ON "AccessGrant"("organisationId", "granteeSubject", "accessTier");

-- CreateIndex
CREATE INDEX "LifecycleEvent_organisationId_batteryItemId_eventTime_idx" ON "LifecycleEvent"("organisationId", "batteryItemId", "eventTime");

-- CreateIndex
CREATE INDEX "TelemetryReading_organisationId_batteryItemId_measuredAt_idx" ON "TelemetryReading"("organisationId", "batteryItemId", "measuredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organisationId_createdAt_idx" ON "AuditEvent"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_organisationId_key_key" ON "IdempotencyRecord"("organisationId", "key");

-- AddForeignKey
ALTER TABLE "RegistryEnrolmentProfile" ADD CONSTRAINT "RegistryEnrolmentProfile_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryIdentity" ADD CONSTRAINT "RegistryIdentity_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrittenAuthorisation" ADD CONSTRAINT "WrittenAuthorisation_responsibleOperatorId_fkey" FOREIGN KEY ("responsibleOperatorId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrittenAuthorisation" ADD CONSTRAINT "WrittenAuthorisation_serviceProviderId_fkey" FOREIGN KEY ("serviceProviderId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryModel" ADD CONSTRAINT "BatteryModel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryItem" ADD CONSTRAINT "BatteryItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryItem" ADD CONSTRAINT "BatteryItem_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "BatteryModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldDefinition" ADD CONSTRAINT "FieldDefinition_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "RegulatoryRuleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportValue" ADD CONSTRAINT "PassportValue_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportValue" ADD CONSTRAINT "PassportValue_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "BatteryModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportValue" ADD CONSTRAINT "PassportValue_batteryItemId_fkey" FOREIGN KEY ("batteryItemId") REFERENCES "BatteryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportValue" ADD CONSTRAINT "PassportValue_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceObject" ADD CONSTRAINT "EvidenceObject_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceObject" ADD CONSTRAINT "EvidenceObject_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "EvidenceObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_passportValueId_fkey" FOREIGN KEY ("passportValueId") REFERENCES "PassportValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionJob" ADD CONSTRAINT "ExtractionJob_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionJob" ADD CONSTRAINT "ExtractionJob_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "EvidenceObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedClaim" ADD CONSTRAINT "ExtractedClaim_extractionJobId_fkey" FOREIGN KEY ("extractionJobId") REFERENCES "ExtractionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedClaim" ADD CONSTRAINT "ExtractedClaim_passportValueId_fkey" FOREIGN KEY ("passportValueId") REFERENCES "PassportValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRequest" ADD CONSTRAINT "SupplierRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRequest" ADD CONSTRAINT "SupplierRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRequest" ADD CONSTRAINT "SupplierRequest_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "BatteryModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRequestField" ADD CONSTRAINT "SupplierRequestField_supplierRequestId_fkey" FOREIGN KEY ("supplierRequestId") REFERENCES "SupplierRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierSubmission" ADD CONSTRAINT "SupplierSubmission_supplierRequestId_fkey" FOREIGN KEY ("supplierRequestId") REFERENCES "SupplierRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierSubmissionEvidence" ADD CONSTRAINT "SupplierSubmissionEvidence_supplierSubmissionId_fkey" FOREIGN KEY ("supplierSubmissionId") REFERENCES "SupplierSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierSubmissionEvidence" ADD CONSTRAINT "SupplierSubmissionEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "EvidenceObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "BatteryModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_batteryItemId_fkey" FOREIGN KEY ("batteryItemId") REFERENCES "BatteryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "RegulatoryRuleSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportVersion" ADD CONSTRAINT "PassportVersion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportVersion" ADD CONSTRAINT "PassportVersion_batteryItemId_fkey" FOREIGN KEY ("batteryItemId") REFERENCES "BatteryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPassportSnapshot" ADD CONSTRAINT "PublicPassportSnapshot_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPassportSnapshot" ADD CONSTRAINT "PublicPassportSnapshot_batteryItemId_fkey" FOREIGN KEY ("batteryItemId") REFERENCES "BatteryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPassportSnapshot" ADD CONSTRAINT "PublicPassportSnapshot_passportVersionId_fkey" FOREIGN KEY ("passportVersionId") REFERENCES "PassportVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrySubmission" ADD CONSTRAINT "RegistrySubmission_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrySubmission" ADD CONSTRAINT "RegistrySubmission_batteryItemId_fkey" FOREIGN KEY ("batteryItemId") REFERENCES "BatteryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrySubmission" ADD CONSTRAINT "RegistrySubmission_passportVersionId_fkey" FOREIGN KEY ("passportVersionId") REFERENCES "PassportVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_batteryItemId_fkey" FOREIGN KEY ("batteryItemId") REFERENCES "BatteryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleEvent" ADD CONSTRAINT "LifecycleEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleEvent" ADD CONSTRAINT "LifecycleEvent_batteryItemId_fkey" FOREIGN KEY ("batteryItemId") REFERENCES "BatteryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryReading" ADD CONSTRAINT "TelemetryReading_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryReading" ADD CONSTRAINT "TelemetryReading_batteryItemId_fkey" FOREIGN KEY ("batteryItemId") REFERENCES "BatteryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
