output "instance_id" {
  value       = aws_instance.app.id
  description = "EC2 instance id"
}

output "public_ip" {
  value       = var.associate_elastic_ip ? aws_eip.app[0].public_ip : aws_instance.app.public_ip
  description = "Use this IP in Cloudflare A records (apex, api, wildcard) when not using a hostname."
}

output "ssh_hint" {
  value       = "ssh -i /path/to/${var.key_name}.pem ubuntu@${var.associate_elastic_ip ? aws_eip.app[0].public_ip : aws_instance.app.public_ip}"
  description = "Default Ubuntu AMI user is ubuntu."
}
