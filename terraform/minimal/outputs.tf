output "ec2_public_ip" {
  value = aws_instance.app.public_ip
}

output "ec2_public_dns" {
  value = aws_instance.app.public_dns
}

output "s3_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "s3_website_url" {
  value = aws_s3_bucket_website_configuration.frontend.website_endpoint
}
