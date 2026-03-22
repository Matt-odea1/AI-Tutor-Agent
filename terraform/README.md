# DynamoDB Infrastructure - Terraform

This directory contains Terraform configuration for the AI Tutor chat session persistence layer.

## 📋 What Gets Created

- **DynamoDB Table**: `chat_sessions` with pay-per-request billing
- **Global Secondary Index**: `UserSessionsIndex` for multi-user support
- **Point-in-Time Recovery**: 35-day backup window
- **TTL**: Auto-delete sessions after 30 days
- **CloudWatch Alarms**: System errors and user errors monitoring

## 🚀 Quick Start

### Prerequisites

1. **Install Terraform** (macOS):
   ```bash
   brew install terraform
   
   # Verify installation
   terraform version
   ```

2. **AWS Credentials** (already configured in your .env):
   ```bash
   # Terraform will use these automatically:
   export AWS_ACCESS_KEY_ID=your_key
   export AWS_SECRET_ACCESS_KEY=your_secret
   export AWS_DEFAULT_REGION=us-east-1
   
   # Or use ~/.aws/credentials file
   ```

### Deploy Infrastructure

```bash
# Navigate to terraform directory
cd terraform/

# Initialize Terraform (download AWS provider)
terraform init

# Preview changes (see what will be created)
terraform plan

# Create the infrastructure
terraform apply
# Type 'yes' when prompted

# View outputs (table name, ARN, etc.)
terraform output
```

### Update Your .env File

After `terraform apply`, copy the output and add to `.env`:

```bash
# DynamoDB Configuration
DYNAMODB_TABLE_NAME=chat_sessions
DYNAMODB_REGION=us-east-1
USE_DYNAMODB=true
```

## 📊 Schema Design

### Primary Key Pattern

```
PK: SESSION#<session_id>  |  SK: METADATA
└─ Session info: created_at, last_accessed, total_tokens, pedagogy_mode

PK: SESSION#<session_id>  |  SK: MESSAGE#<timestamp>
└─ Message: role, content, tokens, context_ids
```

### Global Secondary Index (GSI)

```
GSI1PK: USER#<user_id>  |  GSI1SK: <last_accessed>
└─ Query all sessions for a user, sorted by recency
```

### TTL (Time-To-Live)

```
ttl: <unix_timestamp>
└─ Auto-delete sessions 30 days after creation
```

## 💰 Cost Estimate

**Pay-per-request pricing** (no minimum cost):

| Operation | Monthly Volume | Cost |
|-----------|----------------|------|
| Reads | 100,000 | $0.03 |
| Writes | 50,000 | $0.06 |
| Storage (1GB) | 1GB | $0.25 |
| PITR Backups | 1GB | $0.20 |
| **Total** | | **~$0.54/month** ✅ |

Scale to 10,000 users: ~$5/month

## 🛠️ Common Commands

### View Current State
```bash
terraform show
```

### Update Infrastructure
```bash
# After modifying .tf files
terraform plan
terraform apply
```

### Destroy Infrastructure
```bash
terraform destroy
# ⚠️ WARNING: This deletes the table and all data!
```

### Check Table Status
```bash
aws dynamodb describe-table --table-name chat_sessions --region us-east-1
```

## 🔧 Customization

### Change Table Name
Create `terraform.tfvars`:
```hcl
table_name = "my-custom-table-name"
environment = "development"
```

### Change Region
```hcl
aws_region = "us-west-2"
```

### Disable PITR (not recommended)
```hcl
enable_pitr = false
```

## 📝 Next Steps

1. ✅ Deploy infrastructure with Terraform
2. ⏳ Install boto3: `pip install boto3`
3. ⏳ Create `src/main/agentcore_setup/dynamodb_memory.py`
4. ⏳ Update `.env` with DynamoDB config
5. ⏳ Test with `USE_DYNAMODB=true`

## 🐛 Troubleshooting

### "Error: No valid credential sources found"
```bash
# Set AWS credentials
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
```

### "Error: Table already exists"
```bash
# Import existing table into Terraform state
terraform import aws_dynamodb_table.chat_sessions chat_sessions
```

### "Error: Access Denied"
```bash
# Ensure IAM user has DynamoDB permissions:
# - dynamodb:CreateTable
# - dynamodb:DescribeTable
# - dynamodb:UpdateTable
# - cloudwatch:PutMetricAlarm
```

## 📚 Resources

- [Terraform AWS Provider Docs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [DynamoDB Single Table Design](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html)
- [DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/)
