# Minimal AWS Infrastructure (EC2 + S3)

This Terraform stack provisions the **cheapest workable** AWS setup:
- One EC2 instance for **FastAPI + Neo4j**
- One S3 bucket for the **frontend** static site
- Security group with **80/443 public**, **22 locked to admin IP**

## Prerequisites
- Terraform installed
- AWS credentials configured
- An EC2 key pair already created in AWS

## Quick Start
```bash
cd terraform/minimal
terraform init
terraform plan
terraform apply
```

## Required Inputs
Create a `terraform.tfvars` file:
```hcl
aws_region     = "ap-southeast-2"
key_pair_name  = "your-ec2-keypair"
admin_ip_cidr  = "YOUR.PUBLIC.IP/32"
bucket_name    = "your-unique-s3-bucket-name"
```

## Outputs
After apply, use:
```bash
terraform output
```

Key outputs:
- `ec2_public_ip`
- `ec2_public_dns`
- `s3_bucket_name`

## Notes
- This uses the **default VPC** to keep costs and complexity low.
- It installs Docker + Git via user-data for convenience.
- Neo4j memory caps should be set in your `docker-compose.yml`.
